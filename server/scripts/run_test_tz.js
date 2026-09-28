import { spawnSync } from 'child_process';

console.log('===============================================================');
console.log('     RUNNING TEST SUITE UNDER DIFFERENT TIMEZONES (test:tz)   ');
console.log('===============================================================');

// 1. Run under TZ=UTC
console.log('\n>>> [1/2] Running tests under TZ=UTC...');
const utcResult = spawnSync('npx', ['vitest', 'run'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    TZ: 'UTC',
  },
});

if (utcResult.status !== 0) {
  console.error('\n❌ Tests failed under TZ=UTC');
  process.exit(utcResult.status || 1);
}
console.log('✔ All tests passed under TZ=UTC');

// 2. Run under TZ=Asia/Kolkata
console.log('\n>>> [2/2] Running tests under TZ=Asia/Kolkata...');
const kolkataResult = spawnSync('npx', ['vitest', 'run'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    TZ: 'Asia/Kolkata',
  },
});

if (kolkataResult.status !== 0) {
  console.error('\n❌ Tests failed under TZ=Asia/Kolkata');
  process.exit(kolkataResult.status || 1);
}
console.log('✔ All tests passed under TZ=Asia/Kolkata');

console.log('\n===============================================================');
console.log('>>> ALL TIMEZONE TEST RUNS PASSED SUCCESSFULLY (CODE 0) <<<');
console.log('===============================================================');
