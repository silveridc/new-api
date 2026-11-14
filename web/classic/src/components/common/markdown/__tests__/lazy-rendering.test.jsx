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

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';
import SystemUpdateDialog from '../../SystemUpdateDialog';
import MessageContent from '../../../playground/MessageContent';
import LazyMarkdownRenderer from '../LazyMarkdownRenderer';

const { originalGetContext } = vi.hoisted(() => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillStyle: '',
    fillRect() {},
    measureText: (text) => ({ width: String(text).length }),
  }));
  return { originalGetContext };
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

describe('lazy markdown rendering', () => {
  it('renders the latest content when props change before the renderer loads', async () => {
    const { rerender } = render(
      <LazyMarkdownRenderer content='# Outdated draft' />,
    );
    rerender(
      <LazyMarkdownRenderer
        content={
          '# Current document\n\n**Latest content**\n\n```js\nconst answer = 42;\n```'
        }
        fontSize={13}
        className='document-markdown'
      />,
    );
    await act(async () => {
      await import('../MarkdownRenderer');
    });

    const heading = await screen.findByRole(
      'heading',
      { name: 'Current document' },
      { timeout: 10000 },
    );
    expect(screen.queryByText('Outdated draft')).not.toBeInTheDocument();
    expect(screen.getByText('Latest content').tagName).toBe('STRONG');
    expect(heading.closest('.markdown-body')).toHaveStyle({ fontSize: '13px' });
    expect(heading.closest('.markdown-body')).toHaveClass('document-markdown');
    expect(document.querySelector('pre code')).toHaveTextContent(
      'const answer = 42;',
    );
  });

  it('preserves reasoning and the final reply when an assistant message finishes', async () => {
    const commonProps = {
      styleState: { isMobile: false },
      onToggleReasoningExpansion: vi.fn(),
    };
    const message = {
      id: 'reply-1',
      role: 'assistant',
      status: 'incomplete',
      content: 'A partial reply',
      reasoningContent: 'Checking the inputs',
      isReasoningExpanded: true,
      isThinkingComplete: false,
    };
    const { container, rerender } = render(
      <MessageContent {...commonProps} message={message} />,
    );
    await waitFor(() => {
      expect(container).toHaveTextContent('A partial reply');
      expect(container).toHaveTextContent('Checking the inputs');
    });

    rerender(
      <MessageContent
        {...commonProps}
        message={{
          ...message,
          status: 'complete',
          content: '## Final reply\n\n**All inputs are valid.**',
          isThinkingComplete: true,
        }}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: 'Final reply' }),
    ).toBeInTheDocument();
    expect(screen.getByText('All inputs are valid.').tagName).toBe('STRONG');
    expect(container).toHaveTextContent('Checking the inputs');
    expect(container).not.toHaveTextContent('A partial reply');
  });

  it('renders release notes only after the system update dialog opens', async () => {
    const update = {
      currentVersion: 'v1.0.0',
      online: true,
      hasUpdate: true,
      comparison: 1,
      release: {
        tag_name: 'v1.0.1',
        body: '# Release notes\n\n- **Markdown rendering fixed**',
      },
    };
    const { rerender } = render(
      <SystemUpdateDialog visible={false} update={update} onCancel={vi.fn()} />,
    );
    expect(
      screen.queryByRole('heading', { name: 'Release notes' }),
    ).not.toBeInTheDocument();

    rerender(<SystemUpdateDialog visible update={update} onCancel={vi.fn()} />);

    expect(
      await screen.findByRole('heading', { name: 'Release notes' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Markdown rendering fixed').tagName).toBe('STRONG');
  });
});
