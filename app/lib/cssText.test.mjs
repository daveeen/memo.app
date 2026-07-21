// Runnable self-check: node app/lib/cssText.test.mjs  (ponytail: one assert file, no framework)
import assert from 'node:assert';
import { cssText } from './cssText.ts';

// kebab -> camel, trims, drops empties
assert.deepStrictEqual(cssText('flex:1;border-radius:8px;'), { flex: '1', borderRadius: '8px' });
// values containing colons (gradients, url) survive — split on FIRST colon only
assert.deepStrictEqual(
  cssText('background:linear-gradient(150deg,#C4593E,#9A3B2A);color:#fff'),
  { background: 'linear-gradient(150deg,#C4593E,#9A3B2A)', color: '#fff' }
);
// vendor prefix -> React expects WebkitFontSmoothing (leading cap)
assert.deepStrictEqual(cssText('-webkit-font-smoothing:antialiased'), { WebkitFontSmoothing: 'antialiased' });
// empty / whitespace input
assert.deepStrictEqual(cssText(''), {});
assert.deepStrictEqual(cssText('  ;;  '), {});
console.log('cssText ok');
