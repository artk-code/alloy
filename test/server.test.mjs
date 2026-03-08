import test from 'node:test';
import assert from 'node:assert/strict';

import { contentTypeForStaticPath } from '../src/web/server.mjs';

test('contentTypeForStaticPath serves browser modules as javascript', () => {
  assert.equal(contentTypeForStaticPath('/tmp/index.html'), 'text/html');
  assert.equal(contentTypeForStaticPath('/tmp/styles.css'), 'text/css');
  assert.equal(contentTypeForStaticPath('/tmp/app.js'), 'application/javascript');
  assert.equal(contentTypeForStaticPath('/tmp/view-state.mjs'), 'application/javascript');
});
