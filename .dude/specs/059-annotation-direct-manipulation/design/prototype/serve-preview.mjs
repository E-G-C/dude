// @ts-check
// Start the 059 design proof and keep it attached. Prints the URL to open in a
// browser, then serves until interrupted. Everything it serves belongs to a
// disposable fixture workspace; nothing touches the user's live review.
import { startFixtureDriver } from './fixture-driver.mjs';

const driver = await startFixtureDriver();
process.stdout.write([
  `059 design proof: ${driver.url}`,
  `canonical entrypoint: .dude/specs/059-annotation-direct-manipulation/design/review-direct-manipulation.html`,
  `fixture workspace: ${driver.workspace.root}`,
  'Press Ctrl+C to stop; the fixture workspace is removed on exit.',
  '',
].join('\n'));

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await driver.close();
  process.stdout.write('059 design proof stopped.\n');
  process.exit(0);
};
process.on('SIGINT', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
