/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

// 契约（后端 model/option.go:237-261 validateOptionValue）：
// EmailProvider / ResendApiKey / ResendFrom 三项互相牵连——写任意一项时，后端都会用
// 「合并后的当前设置」整体校验，只要合并结果的发信方式是 resend 就要求 Key 非空且
// 发件人能被 net/mail 解析。因此：
//   1) 三项必须按返回数组的顺序串行 PUT，不能并行（并行会让校验读到中间态）；
//   2) EmailProvider 永远排在最后，凭据没存上就不能把发信方式切过去；
//   3) ResendApiKey 只写不回显（controller/option.go:92-99 按敏感后缀过滤），
//      所以留空表示「不修改」，绝不产出空值写入——发信方式已是 resend 时清空 Key 会被拒。
// 未选中的那一套设置不产生写入：后端 SendEmail 只用选中的方式发信，另一套原样保留。
//
// 关于 undefined（实测 Chrome + Semi 复现）：本页所有卡片共用一个 Semi Form，任一输入框
// 变化都会把 onValueChange 的 values 整体塞给 inputs，而 Semi 会把当前值为空串的字段整个
// 丢掉（读出来是 undefined）。GET /api/option 那边同样的项是 ''，一比就成了「用户改过」；
// undefined 进 PUT body 会被 JSON.stringify 抹掉，后端 UpdateOption 再
// fmt.Sprintf("%v", nil) 就落库成字面量 "<nil>"。
// 所以这里把 undefined 归一成 ''：等价于「这一项当前是空的」，既不会写出 undefined，
// 也保留了用户主动清空某个字段的能力。

function normalizeProvider(value) {
  return value === 'resend' ? 'resend' : 'smtp';
}

export function buildEmailOptionWrites(originInputs, inputs) {
  const originProvider = normalizeProvider(originInputs.EmailProvider);
  // 表单里读不到发信方式时沿用服务端的选择，不能因为项缺失就把发信方式切走。
  const provider =
    typeof inputs.EmailProvider === 'string'
      ? normalizeProvider(inputs.EmailProvider)
      : originProvider;
  const writes = [];

  const pushChanged = (key, blankMeansNoChange = false) => {
    const value = typeof inputs[key] === 'string' ? inputs[key] : '';
    if (blankMeansNoChange && value === '') return;
    if (value === originInputs[key]) return;
    writes.push({ key, value });
  };

  if (provider === 'resend') {
    const apiKey = (inputs.ResendApiKey || '').trim();
    if (apiKey !== '') {
      writes.push({ key: 'ResendApiKey', value: apiKey });
    }
    pushChanged('ResendFrom');
  } else {
    pushChanged('SMTPServer');
    pushChanged('SMTPAccount');
    pushChanged('SMTPFrom');
    pushChanged('SMTPPort', true);
    pushChanged('SMTPToken', true);
  }

  if (provider !== originProvider) {
    writes.push({ key: 'EmailProvider', value: provider });
  }

  return writes;
}
