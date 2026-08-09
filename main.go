package main

import (
	"bytes"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/relay"
	"github.com/QuantumNous/new-api/router"
	"github.com/QuantumNous/new-api/service"
	_ "github.com/QuantumNous/new-api/setting/performance_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/getsentry/sentry-go"
	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	_ "net/http/pprof"
)

var (
	buildFS          fs.FS
	indexPage        []byte
	classicBuildFS   fs.FS
	classicIndexPage []byte
	useFrontend      = true
)

// zhaoyj add: 前端加载逻辑
func loadWebAssetsFromDisk() {
	_ = godotenv.Load(".env")
	if os.Getenv("USE_FRONTEND") == "false" {
		useFrontend = false
		log.Println("Frontend service is disabled by configuration.")
		return
	}
	if os.Getenv("USE_NGINX") == "true" {
		useFrontend = false
		log.Println("Frontend Use Nginx")
		return
	}
	var err error
	buildFS = os.DirFS("./frontend/default")
	indexPage, err = os.ReadFile("./frontend/default/index.html")
	if err != nil {
		log.Printf("Warning: ./frontend/default/index.html not found: %v", err)
	}

	classicBuildFS = os.DirFS("./frontend/classic")
	classicIndexPage, err = os.ReadFile("./frontend/classic/index.html")
	if err != nil {
		log.Printf("Warning: ./frontend/classic/index.html not found: %v", err)
	}
}

func main() {
	startTime := time.Now()

	loadWebAssetsFromDisk()

	if err := InitResources(); err != nil {
		common.FatalLog("failed to initialize resources: " + err.Error())
		return
	}

	//zhaoyj add: sentry
	err := sentry.Init(sentry.ClientOptions{
		// your sentry dsn on here
		Dsn:              "",
		Release:          "new-api@" + common.Version,
		EnableTracing:    true,
		TracesSampleRate: 1.0,
		SendDefaultPII:   true,
		Debug:            true,
	})
	if err != nil {
		common.SysError(fmt.Sprintf("Sentry initialization failed: %v", err))
	} else {
		defer sentry.Flush(2 * time.Second)
		common.SysLog("Sentry initialized successfully")
	}

	common.SysLog("New API " + common.Version + " started")
	if os.Getenv("GIN_MODE") != "debug" {
		gin.SetMode(gin.ReleaseMode)
	}
	if common.DebugEnabled {
		common.SysLog("running in debug mode")
	}

	defer func() {
		if err := model.CloseDB(); err != nil {
			common.FatalLog("failed to close database: " + err.Error())
		}
	}()

	if common.RedisEnabled {
		common.MemoryCacheEnabled = true
	}
	if common.MemoryCacheEnabled {
		common.SysLog("memory cache enabled")
		common.SysLog(fmt.Sprintf("sync frequency: %d seconds", common.SyncFrequency))

		func() {
			defer func() {
				if r := recover(); r != nil {
					common.SysLog(fmt.Sprintf("InitChannelCache panic: %v, retrying once", r))
					if _, _, fixErr := model.FixAbility(); fixErr != nil {
						common.FatalLog(fmt.Sprintf("InitChannelCache failed: %s", fixErr.Error()))
					}
				}
			}()
			model.InitChannelCache()
		}()

		go model.SyncChannelCache(common.SyncFrequency)
	}

	go model.SyncOptions(common.SyncFrequency)
	go model.UpdateQuotaData()

	if os.Getenv("CHANNEL_UPDATE_FREQUENCY") != "" {
		frequency, err := strconv.Atoi(os.Getenv("CHANNEL_UPDATE_FREQUENCY"))
		if err != nil {
			common.FatalLog("failed to parse CHANNEL_UPDATE_FREQUENCY: " + err.Error())
		}
		go controller.AutomaticallyUpdateChannels(frequency)
	}

	go controller.AutomaticallyTestChannels()
	service.StartCodexCredentialAutoRefreshTask()
	service.StartSubscriptionQuotaResetTask()

	service.GetTaskAdaptorFunc = func(platform constant.TaskPlatform) service.TaskPollingAdaptor {
		a := relay.GetTaskAdaptor(platform)
		if a == nil {
			return nil
		}
		return a
	}

	controller.StartChannelUpstreamModelUpdateTask()

	if common.IsMasterNode && constant.UpdateTask {
		gopool.Go(func() {
			controller.UpdateMidjourneyTaskBulk()
		})
		gopool.Go(func() {
			controller.UpdateTaskBulk()
		})
	}
	if os.Getenv("BATCH_UPDATE_ENABLED") == "true" {
		common.BatchUpdateEnabled = true
		common.SysLog("batch update enabled with interval " + strconv.Itoa(common.BatchUpdateInterval) + "s")
		model.InitBatchUpdater()
	}

	if os.Getenv("ENABLE_PPROF") == "true" {
		gopool.Go(func() {
			log.Println(http.ListenAndServe("0.0.0.0:8005", nil))
		})
		go common.Monitor()
		common.SysLog("pprof enabled")
	}

	if err := common.StartPyroScope(); err != nil {
		common.SysError(fmt.Sprintf("start pyroscope error : %v", err))
	}

	server := gin.New()

	// Sentry Middleware (Must be before Recovery)
	server.Use(sentrygin.New(sentrygin.Options{
		Repanic: true,
	}))

	// Custom Recovery
	server.Use(gin.CustomRecovery(func(c *gin.Context, err any) {
		common.SysLog(fmt.Sprintf("panic detected: %v", err))
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"message": fmt.Sprintf("Panic detected, error: %v. Please submit a issue here: https://github.com/Calcium-Ion/new-api", err),
				"type":    "new_api_panic",
			},
		})
	}))

	server.Use(middleware.RequestId())
	server.Use(middleware.PoweredBy())
	server.Use(middleware.I18n())
	middleware.SetUpLogger(server)

	store := cookie.NewStore([]byte(common.SessionSecret))
	store.Options(sessions.Options{
		Path:     "/",
		MaxAge:   2592000,
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteStrictMode,
	})
	server.Use(sessions.Sessions("session", store))

	InjectUmamiAnalytics()
	InjectGoogleAnalytics()
	//zhaoyj add
	if useFrontend {
		// Explicitly mount static directories to prevent routing overrides
		server.Static("/assets", "./frontend/default/assets")

		// Pass empty embed.FS to the internal router to satisfy interface requirements
		var bFS, cFS embed.FS
		router.SetRouter(server, router.ThemeAssets{
			DefaultBuildFS:   bFS,
			DefaultIndexPage: indexPage,
			ClassicBuildFS:   cFS,
			ClassicIndexPage: classicIndexPage,
		})

		// Physical file sniffer and SPA fallback interceptor
		// Must be placed after router.SetRouter to override the default NoRoute
		baseDir := "./frontend/default"
		fileServer := http.FileServer(http.Dir(baseDir))

		server.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path

			// Bypass API routes
			if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/v1") {
				c.JSON(http.StatusNotFound, gin.H{"message": "API not found"})
				return
			}

			// Sniff physical files (e.g., /favicon.ico, /logo.png)
			localPath := filepath.Join(baseDir, filepath.Clean(path))
			fileInfo, err := os.Stat(localPath)

			if err == nil && !fileInfo.IsDir() {
				fileServer.ServeHTTP(c.Writer, c.Request)
				return
			}

			// SPA Fallback: serve index.html for frontend routing
			c.Data(http.StatusOK, "text/html; charset=utf-8", indexPage)
		})
	} else {
		server.GET("/", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"status":  404,
				"message": "Resource Not Found",
				"time":    time.Now().Format(time.RFC3339),
			})
		})
		router.SetRouter(server, router.ThemeAssets{})
	}

	var port = os.Getenv("PORT")
	if port == "" {
		port = strconv.Itoa(*common.Port)
	}

	common.LogStartupSuccess(startTime, port)

	if err := server.Run(":" + port); err != nil {
		common.FatalLog("failed to start HTTP server: " + err.Error())
	}
}

// zhaoyj fix
func InjectUmamiAnalytics() {
	if !useFrontend || len(indexPage) == 0 {
		return
	}
	analyticsInjectBuilder := &strings.Builder{}
	if os.Getenv("UMAMI_WEBSITE_ID") != "" {
		umamiSiteID := os.Getenv("UMAMI_WEBSITE_ID")
		umamiScriptURL := os.Getenv("UMAMI_SCRIPT_URL")
		if umamiScriptURL == "" {
			umamiScriptURL = "https://analytics.umami.is/script.js"
		}
		analyticsInjectBuilder.WriteString("<script defer src=\"")
		analyticsInjectBuilder.WriteString(umamiScriptURL)
		analyticsInjectBuilder.WriteString("\" data-website-id=\"")
		analyticsInjectBuilder.WriteString(umamiSiteID)
		analyticsInjectBuilder.WriteString("\"></script>")
	}
	analyticsInjectBuilder.WriteString("\n</head>")

	analyticsInject := []byte(analyticsInjectBuilder.String())
	placeholder := []byte("</head>")

	indexPage = bytes.Replace(indexPage, placeholder, analyticsInject, 1)
	classicIndexPage = bytes.Replace(classicIndexPage, placeholder, analyticsInject, 1)
}

func InjectGoogleAnalytics() {
	if !useFrontend || len(indexPage) == 0 {
		return
	}
	analyticsInjectBuilder := &strings.Builder{}
	if os.Getenv("GOOGLE_ANALYTICS_ID") != "" {
		gaID := os.Getenv("GOOGLE_ANALYTICS_ID")
		analyticsInjectBuilder.WriteString("<script async src=\"https://www.googletagmanager.com/gtag/js?id=")
		analyticsInjectBuilder.WriteString(gaID)
		analyticsInjectBuilder.WriteString("\"></script>")
		analyticsInjectBuilder.WriteString("<script>")
		analyticsInjectBuilder.WriteString("window.dataLayer = window.dataLayer || [];")
		analyticsInjectBuilder.WriteString("function gtag(){dataLayer.push(arguments);}")
		analyticsInjectBuilder.WriteString("gtag('js', new Date());")
		analyticsInjectBuilder.WriteString("gtag('config', '")
		analyticsInjectBuilder.WriteString(gaID)
		analyticsInjectBuilder.WriteString("');")
		analyticsInjectBuilder.WriteString("</script>")
	}
	analyticsInjectBuilder.WriteString("\n</head>")

	analyticsInject := []byte(analyticsInjectBuilder.String())
	placeholder := []byte("</head>")

	indexPage = bytes.Replace(indexPage, placeholder, analyticsInject, 1)
	classicIndexPage = bytes.Replace(classicIndexPage, placeholder, analyticsInject, 1)
}

func InitResources() error {
	err := godotenv.Load(".env")
	if err != nil && common.DebugEnabled {
		common.SysLog("No .env file found...")
	}

	common.InitEnv()
	logger.SetupLogger()
	ratio_setting.InitRatioSettings()
	service.InitHttpClient()
	service.InitTokenEncoders()

	if err := model.InitDB(); err != nil {
		common.FatalLog("failed to initialize database: " + err.Error())
		return err
	}

	model.CheckSetup()
	model.InitOptionMap()
	common.CleanupOldCacheFiles()
	model.GetPricing()

	if err := model.InitLogDB(); err != nil {
		return err
	}
	if err := common.InitRedisClient(); err != nil {
		return err
	}

	perfmetrics.Init()
	common.StartSystemMonitor()

	if err := i18n.Init(); err != nil {
		common.SysError("failed to initialize i18n: " + err.Error())
	} else {
		common.SysLog("i18n initialized with languages: " + strings.Join(i18n.SupportedLanguages(), ", "))
	}

	i18n.SetUserLangLoader(model.GetUserLanguage)

	if err := oauth.LoadCustomProviders(); err != nil {
		common.SysError("failed to load custom OAuth providers: " + err.Error())
	}

	return nil
}
