import test from 'node:test';
import assert from 'node:assert/strict';
import { PanelPositionControls } from './panelPositionControls.js';

function restoreWith({ stored, allowStored = true }) {
  const saved = {
    document: globalThis.document,
    localStorage: globalThis.localStorage,
  };
  const classes = new Set(['panel-collapsible', 'collapsed']);
  const panel = {
    dataset: {},
    classList: {
      contains: (name) => classes.has(name),
      toggle: (name, active) =>
        active ? classes.add(name) : classes.delete(name),
    },
  };
  globalThis.document = { getElementById: () => panel };
  globalThis.localStorage = { getItem: () => stored };
  try {
    const controls = new PanelPositionControls({
      syncPanelCollapseButton: () => {},
      layoutRightPanels: () => {},
      syncCctvPanelViewport: () => {},
      showToast: () => {},
    });
    controls._restorePanelCollapsedState('cctv-panel', { allowStored });
    return panel.dataset.collapsedPreference;
  } finally {
    globalThis.document = saved.document;
    globalThis.localStorage = saved.localStorage;
  }
}

test('a restored panel records whether its collapsed state was the default', () => {
  assert.equal(restoreWith({ stored: null }), 'default');
});

test('a restored panel records a stored collapsed choice', () => {
  assert.equal(restoreWith({ stored: '0' }), 'stored');
  assert.equal(restoreWith({ stored: '1' }), 'stored');
});

test('a panel laid out from a share link records the share as its preference', () => {
  assert.equal(restoreWith({ stored: '0', allowStored: false }), 'share');
});
