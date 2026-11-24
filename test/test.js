const assert = require('assert');
const { normalizeAttendancePayload, calculateAttendanceInsights } = require('../erpParser');

console.log('Running LifeOS QUMS ERP 11-Subject Parser & Calculation Tests...');

const fullSampleResponse = {
  state: JSON.stringify([{
    DateFrom: '26/07/2026',
    DateTo: '23/11/2026',
    TotalLecture: 330,
    TotalPresent: 285,
    TotalAbsent: 45,
    TotalLeave: 0,
    TotalPercentage: 86.36
  }]),
  data: JSON.stringify([
    { SubjectID: 1, YearSem: 5, DateFrom: '26/07/2026', DateTo: '23/11/2026', Subject: 'Corporate Communication', SubjectCode: 'AE35362', TotalLecture: 10, TotalPresent: 9, TotalAbsent: 1, TotalLeave: 0, Percentage: 90.00, SubjectCredit: 2 },
    { SubjectID: 2, YearSem: 5, DateFrom: '26/07/2026', DateTo: '23/11/2026', Subject: 'Design and Analysis of Algorithm', SubjectCode: 'CS35303', TotalLecture: 41, TotalPresent: 32, TotalAbsent: 9, TotalLeave: 0, Percentage: 78.05, SubjectCredit: 3 },
    { SubjectID: 3, YearSem: 5, DateFrom: '26/07/2026', DateTo: '23/11/2026', Subject: 'Design and Analysis of Algorithm Lab', SubjectCode: 'CS35363', TotalLecture: 30, TotalPresent: 26, TotalAbsent: 4, TotalLeave: 0, Percentage: 86.67, SubjectCredit: 1 },
    { SubjectID: 4, YearSem: 5, DateFrom: '26/07/2026', DateTo: '23/11/2026', Subject: 'Foundation of Cloud Computing', SubjectCode: 'CS35304', TotalLecture: 39, TotalPresent: 36, TotalAbsent: 3, TotalLeave: 0, Percentage: 92.31, SubjectCredit: 3 },
    { SubjectID: 5, YearSem: 5, DateFrom: '26/07/2026', DateTo: '23/11/2026', Subject: 'Investment Management', SubjectCode: 'BC30302', TotalLecture: 28, TotalPresent: 24, TotalAbsent: 4, TotalLeave: 0, Percentage: 85.71, SubjectCredit: 3 },
    { SubjectID: 6, YearSem: 5, DateFrom: '26/07/2026', DateTo: '23/11/2026', Subject: 'Mini Project - III', SubjectCode: 'CS35378', TotalLecture: 13, TotalPresent: 13, TotalAbsent: 0, TotalLeave: 0, Percentage: 100.00, SubjectCredit: 2 },
    { SubjectID: 7, YearSem: 5, DateFrom: '26/07/2026', DateTo: '23/11/2026', Subject: 'Operating System', SubjectCode: 'CS35301', TotalLecture: 12, TotalPresent: 12, TotalAbsent: 0, TotalLeave: 0, Percentage: 100.00, SubjectCredit: 3 },
    { SubjectID: 8, YearSem: 5, DateFrom: '26/07/2026', DateTo: '23/11/2026', Subject: 'Personal Tax Planning', SubjectCode: 'BC30301', TotalLecture: 35, TotalPresent: 34, TotalAbsent: 1, TotalLeave: 0, Percentage: 97.14, SubjectCredit: 3 },
    { SubjectID: 9, YearSem: 5, DateFrom: '26/07/2026', DateTo: '23/11/2026', Subject: 'Summer Internship II', SubjectCode: 'SI35375', TotalLecture: 13, TotalPresent: 12, TotalAbsent: 1, TotalLeave: 0, Percentage: 92.31, SubjectCredit: 2 },
    { SubjectID: 10, YearSem: 5, DateFrom: '26/07/2026', DateTo: '23/11/2026', Subject: 'Technical Skills Development-IV', SubjectCode: 'SE35369', TotalLecture: 68, TotalPresent: 54, TotalAbsent: 14, TotalLeave: 0, Percentage: 79.41, SubjectCredit: 2 },
    { SubjectID: 11, YearSem: 5, DateFrom: '26/07/2026', DateTo: '23/11/2026', Subject: 'Web Technology', SubjectCode: 'CS35302', TotalLecture: 41, TotalPresent: 33, TotalAbsent: 8, TotalLeave: 0, Percentage: 80.49, SubjectCredit: 3 }
  ])
};

const parsed = normalizeAttendancePayload(fullSampleResponse);

// Verify overall stats
assert.strictEqual(parsed.overall.DateFrom, '26/07/2026');
assert.strictEqual(parsed.overall.DateTo, '23/11/2026');
assert.strictEqual(parsed.overall.TotalLecture, 330);
assert.strictEqual(parsed.overall.TotalPresent, 285);
assert.strictEqual(parsed.overall.TotalAbsent, 45);
assert.strictEqual(parsed.overall.TotalLeave, 0);
assert.strictEqual(parsed.overall.TotalPercentage, 86.36);

// Verify all 11 subjects
assert.strictEqual(parsed.subjects.length, 11);
const expectedPercentages = [90.00, 78.05, 86.67, 92.31, 85.71, 100.00, 100.00, 97.14, 92.31, 79.41, 80.49];
parsed.subjects.forEach((s, i) => {
  assert.strictEqual(s.Percentage, expectedPercentages[i]);
  assert.strictEqual(s.YearSem, 5);
  assert.ok(s.SubjectCode.length > 0);
  assert.ok(s.SubjectCredit !== null);
});
console.log('PASS: All 11 subjects and overall 86.36% (285/330) parsed with exact field preservation.');

// Verify attendance insights calculation
const insights75 = calculateAttendanceInsights(285, 330, 75);
assert.strictEqual(insights75.canMiss, 50); // 285 / 0.75 - 330 = 380 - 330 = 50
assert.strictEqual(insights75.needed, 0);

const insights90 = calculateAttendanceInsights(285, 330, 90);
assert.strictEqual(insights90.canMiss, 0);
assert.strictEqual(insights90.needed, 120); // (0.9*330 - 285) / 0.1 = 12 / 0.1 = 120
console.log('PASS: Attendance planner insights (canMiss & needed) verified.');

// Verify double-encoded JSON string
const doubleEncoded = normalizeAttendancePayload(JSON.stringify(fullSampleResponse));
assert.strictEqual(doubleEncoded.overall.TotalPercentage, 86.36);
assert.strictEqual(doubleEncoded.subjects.length, 11);
console.log('PASS: Double-encoded JSON outer payload parsed cleanly.');

// 4. Test db/store.js (user auth + AES-256-GCM encrypted QUMS session persistence)
const fs = require('fs');
const path = require('path');
const dbStore = require('../db/store');
const testUser = 'testuser_' + Date.now();
const reg = dbStore.registerUser(testUser, 'pass1234');
assert.strictEqual(reg.ok, true);
const log = dbStore.loginUser(testUser, 'pass1234');
assert.strictEqual(log.ok, true);
assert.strictEqual(dbStore.saveQumsSessionForUser(log.token, { cookies: 'ASP.NET_SessionId=abc', regId: '1001', yearSem: 5 }), true);
const restored = dbStore.getQumsSessionForUser(log.token);
assert.strictEqual(restored.regId, '1001');
assert.strictEqual(restored.cookies, 'ASP.NET_SessionId=abc');
const dbFile = path.join(__dirname, '..', 'data', 'lifeos-db.json');
dbStore.saveSupportConfig({ upiId: 'demo@upi', coffeeUrl: 'https://www.jatinlogs.in/', scannerImage: 'data:image/png;base64,AAA' });
const overview = dbStore.getAdminOverview();
assert.strictEqual(overview.totalUsers >= 1, true);
assert.strictEqual(overview.supportConfig.upiId, 'demo@upi');
assert.strictEqual(overview.activityLogs.length >= 1, true);
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
console.log('PASS: User auth & encrypted QUMS session persistence verified.');

console.log('All tests passed!');
