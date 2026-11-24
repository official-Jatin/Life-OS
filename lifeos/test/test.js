const assert = require('assert');
const { normalizeAttendancePayload } = require('../erpParser');

console.log('Running LifeOS QUMS ERP Parser & Error-Handling Tests...');

// 1. Test exact user-supplied QUMS ERP response
const sampleErpResponse = {
  state: '[{"TotalLecture":330,"TotalPresent":285,"TotalAbsent":45,"TotalLeave":0,"TotalPercentage":86.36}]',
  data: '[{"Subject":"Design and Analysis of Algorithm","SubjectCode":"CS35303","TotalLecture":41,"TotalPresent":32,"TotalAbsent":9,"TotalLeave":0,"Percentage":78.05,"SubjectCredit":3}]'
};

const parsed = normalizeAttendancePayload(sampleErpResponse);

assert.strictEqual(parsed.overall.TotalLecture, 330);
assert.strictEqual(parsed.overall.TotalPresent, 285);
assert.strictEqual(parsed.overall.TotalAbsent, 45);
assert.strictEqual(parsed.overall.TotalLeave, 0);
assert.strictEqual(parsed.overall.TotalPercentage, 86.36);

assert.strictEqual(parsed.subjects.length, 1);
assert.strictEqual(parsed.subjects[0].Subject, 'Design and Analysis of Algorithm');
assert.strictEqual(parsed.subjects[0].SubjectCode, 'CS35303');
assert.strictEqual(parsed.subjects[0].TotalLecture, 41);
assert.strictEqual(parsed.subjects[0].TotalPresent, 32);
assert.strictEqual(parsed.subjects[0].TotalAbsent, 9);
assert.strictEqual(parsed.subjects[0].TotalLeave, 0);
assert.strictEqual(parsed.subjects[0].Percentage, 78.05);
assert.strictEqual(parsed.subjects[0].SubjectCredit, 3);
console.log('PASS: Exact QUMS ERP response parsed with all fields preserved.');

// 2. Test fallback percentage calculation ONLY when ERP omits Percentage / TotalPercentage
const missingPctResponse = {
  state: '[{"TotalLecture":100,"TotalPresent":72,"TotalAbsent":28,"TotalLeave":0}]',
  data: '[{"Subject":"Operating Systems","SubjectCode":"CS35301","TotalLecture":20,"TotalPresent":15,"TotalAbsent":5,"TotalLeave":0,"SubjectCredit":4}]'
};

const parsedFallback = normalizeAttendancePayload(missingPctResponse);
assert.strictEqual(parsedFallback.overall.TotalPercentage, 72);
assert.strictEqual(parsedFallback.subjects[0].Percentage, 75);
console.log('PASS: Percentage fallback calculated only when omitted by ERP.');

// 3. Test invalid/non-JSON outer payload throws cleanly
assert.throws(() => {
  normalizeAttendancePayload({ state: '<html>Login</html>', data: '<html>Login</html>' });
}, /Unexpected ERP response format/);
console.log('PASS: Non-JSON login HTML inside state/data throws expected error.');

console.log('All tests passed!');
