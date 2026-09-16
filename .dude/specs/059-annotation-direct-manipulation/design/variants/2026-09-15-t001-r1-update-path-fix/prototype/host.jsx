// Design-only bootstrap for feature 059. Copyright (c) 2026 Enrique Gonzalez.
// MIT; see prototype/review/NOTICE.txt for the adopted Review notices.
//
// This file exists to run the ACTUAL ReviewWorkspace component and the ACTUAL
// mountReview state/history owner against a real isolated fixture review. It
// carries no annotation logic of its own: every gesture, cursor, history, and
// comment decision belongs to the source-derived modules under
// prototype/review/, and the chrome belongs to prototype/frontend/review.jsx.
//
// It mirrors what src/extensions/dude/frontend/app.jsx does around Review:
// read the provider feed, open the review through the real route, load the
// engine from the fixed /review/ path, and mount the workspace inside the same
// FluentProvider/AriaLiveAnnouncer shell.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AriaLiveAnnouncer, Button, FluentProvider, Text } from '@fluentui/react-components';
import { mergeClasses, useCanvasStyles } from './frontend/styles.js';
import { darkTheme, lightTheme, useHostAppearance } from './frontend/theme.js';
import { Notice } from './frontend/needs-you.jsx';
import { loadReviewEngine, ReviewHistory, ReviewWorkspace } from './frontend/review.jsx';
import { requestKey } from './frontend/use-canvas-data.js';

async function json(route, options = {}) {
  const response = await fetch(route, {
    ...options,
    ...(options.body === undefined ? {} : {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options.body),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(payload.message || payload.error || 'The fixture provider refused this action.'),
      { code: payload.error });
  }
  return payload;
}

function DesignHost() {
  const s = useCanvasStyles();
  const theme = useHostAppearance();
  const [feed, setFeed] = useState(null);
  const [failure, setFailure] = useState(null);
  const [entry, setEntry] = useState(null);
  const [active, setActive] = useState(true);
  const [history, setHistory] = useState(null);
  const [attempts, setAttempts] = useState({});
  const opening = useRef(false);

  const readFeed = useCallback(async () => {
    try {
      const value = await json('/api/needs-you');
      setFeed(value);
      return value;
    } catch (error) {
      setFailure(error.message);
      return null;
    }
  }, []);

  const openReview = useCallback(async (record, restore = false) => {
    if (opening.current) return;
    opening.current = true;
    try {
      const [opened, module] = await Promise.all([
        json('/api/needs-you/review/open', { body: { requestHandle: record.requestHandle, revision: record.request.revision } }),
        loadReviewEngine(),
      ]);
      const current = await readFeed();
      // Observation only, for the design proof harness: the real module is
      // passed through unchanged, and the exact instance ReviewWorkspace mounts
      // is recorded so a harness can read the engine's own state.
      const observed = { ...module, mountReview: (...args) => {
        const mounted = module.mountReview(...args);
        window.__designReviewEngine = mounted;
        return mounted;
      } };
      setEntry({ key: requestKey(current ?? feed, record), record, review: opened, module: observed, restoreRequested: restore });
      setActive(true);
      setHistory(null);
    } catch (error) {
      setFailure(error.message);
      throw error;
    } finally { opening.current = false; }
  }, [feed, readFeed]);

  useEffect(() => {
    void (async () => {
      const value = await readFeed();
      const record = value?.requests.find(item => item.phase === 'pending');
      if (!record) { setFailure('The fixture provider has no waiting review request.'); return; }
      await openReview(record).catch(() => {});
    })();
  }, []);

  const data = {
    needs: feed,
    issues: { needs: failure ? 'unavailable' : null },
    attempts,
    // Real provider actions only. Nothing here manufactures a receipt, a
    // delivery, or a saved file; the adapter answers or the UI reports why not.
    respond: async (record, response) => {
      try {
        const result = await json('/api/needs-you/respond', {
          body: { requestHandle: record.requestHandle, revision: record.request.revision, response },
        });
        await readFeed();
        return result;
      } catch (error) {
        setAttempts(previous => ({ ...previous, [entry?.key]: { phase: 'failed', message: error.message, retryable: false } }));
        await readFeed();
        return null;
      }
    },
    reconcile: () => { void readFeed(); },
  };

  return <FluentProvider theme={theme === 'dark' ? darkTheme : lightTheme}>
    <AriaLiveAnnouncer><div className={mergeClasses(s.page, s.app)}>
      <header><div className={s.titlebar}>
        <Text weight="semibold">Review design proof 059 — direct manipulation</Text>
        <Text className={s.eyebrow}>Fixture review served by the design driver. Not the user's live session.</Text>
      </div></header>
      <main className={s.product}>
        {!entry && <div className={s.detail}><div className={s.measure}>
          <Notice intent={failure ? 'warning' : 'info'} title={failure ? 'Fixture review unavailable' : 'Opening the fixture review'}>
            {failure ?? 'The design driver is opening its isolated fixture review through the real provider and Review adapter.'}
          </Notice>
        </div></div>}
        {entry && !history && !active && <div className={s.detail}><div className={s.measure}>
          <Notice title="Review parked">
            Back left the review mounted, exactly as the workspace does inside Canvas. Its markup is retained in this tab.
          </Notice>
          <Button appearance="primary" onClick={() => setActive(true)}>Resume review</Button>
        </div></div>}
        {entry && <ReviewWorkspace key={entry.review.submissionId} entry={entry} active={active && !history}
          theme={theme} data={data} onReturn={() => setActive(false)} onReviewed={() => {}}
          onHistory={async (scope, submissionId) => {
            try {
              const query = new URLSearchParams({ ideaPath: scope.ideaPath, specPath: scope.specPath });
              if (submissionId) query.set('submissionId', submissionId);
              setHistory({ record: await json(`/api/needs-you/review/history?${query}`) });
            } catch (error) { setFailure(error.message); }
          }}
          onRestore={record => openReview(record, true)} />}
        {history && <ReviewHistory record={history.record} onReturn={() => setHistory(null)} />}
      </main>
      <footer className={s.footer}>
        <span>{feed ? `Fixture request coverage: ${feed.coverage.state}` : 'Fixture request coverage unavailable'}</span>
        <span>Design proof for .dude/specs/059-annotation-direct-manipulation</span>
      </footer>
    </div></AriaLiveAnnouncer>
  </FluentProvider>;
}

createRoot(document.getElementById('root')).render(<DesignHost />);
