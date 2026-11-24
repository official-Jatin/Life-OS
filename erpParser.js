function safeJsonParse(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hasNumericValue(val) {
  return val !== undefined && val !== null && val !== '' && Number.isFinite(Number(val));
}

function toNumber(val, fallback = 0) {
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeAttendancePayload(outerJson) {
  if (typeof outerJson === 'string') {
    outerJson = safeJsonParse(outerJson);
  }
  if (outerJson && typeof outerJson === 'object' && outerJson.d !== undefined && outerJson.state === undefined) {
    outerJson = typeof outerJson.d === 'string' ? safeJsonParse(outerJson.d) : outerJson.d;
  }

  if (!outerJson || typeof outerJson !== 'object') {
    throw new Error('Unexpected ERP response: outer payload is not an object.');
  }

  const parsedState = safeJsonParse(outerJson.state);
  const parsedData = safeJsonParse(outerJson.data);

  if (parsedState === null && parsedData === null) {
    throw new Error('Unexpected ERP response format: unable to parse state or data JSON.');
  }

  const stateObj = Array.isArray(parsedState) ? (parsedState[0] || {}) : (parsedState || {});
  const dataRows = Array.isArray(parsedData) ? parsedData : [];

  const subjects = dataRows.map((row) => {
    const totalLecture = toNumber(row.TotalLecture, 0);
    const totalPresent = toNumber(row.TotalPresent, 0);
    const totalAbsent = hasNumericValue(row.TotalAbsent)
      ? toNumber(row.TotalAbsent, 0)
      : Math.max(0, totalLecture - totalPresent);
    const totalLeave = toNumber(row.TotalLeave, 0);
    const subjectCredit = hasNumericValue(row.SubjectCredit) ? toNumber(row.SubjectCredit, 0) : null;

    const percentage = hasNumericValue(row.Percentage)
      ? Number(toNumber(row.Percentage, 0).toFixed(2))
      : Number((totalLecture > 0 ? (totalPresent / totalLecture) * 100 : 0).toFixed(2));

    return {
      SubjectID: row.SubjectID ?? null,
      Subject: row.Subject || 'Unknown Subject',
      SubjectCode: row.SubjectCode || '',
      YearSem: row.YearSem ?? null,
      DateFrom: row.DateFrom || null,
      DateTo: row.DateTo || null,
      TotalLecture: totalLecture,
      TotalPresent: totalPresent,
      TotalAbsent: totalAbsent,
      TotalLeave: totalLeave,
      SubjectCredit: subjectCredit,
      Percentage: percentage
    };
  });

  const sumTotal = subjects.reduce((acc, s) => acc + s.TotalLecture, 0);
  const sumPresent = subjects.reduce((acc, s) => acc + s.TotalPresent, 0);

  const totalLecture = hasNumericValue(stateObj.TotalLecture) ? toNumber(stateObj.TotalLecture, 0) : sumTotal;
  const totalPresent = hasNumericValue(stateObj.TotalPresent) ? toNumber(stateObj.TotalPresent, 0) : sumPresent;
  const totalAbsent = hasNumericValue(stateObj.TotalAbsent)
    ? toNumber(stateObj.TotalAbsent, 0)
    : Math.max(0, totalLecture - totalPresent);
  const totalLeave = toNumber(stateObj.TotalLeave, 0);

  const totalPercentage = hasNumericValue(stateObj.TotalPercentage)
    ? Number(toNumber(stateObj.TotalPercentage, 0).toFixed(2))
    : Number((totalLecture > 0 ? (totalPresent / totalLecture) * 100 : 0).toFixed(2));

  return {
    overall: {
      DateFrom: stateObj.DateFrom || null,
      DateTo: stateObj.DateTo || null,
      TotalLecture: totalLecture,
      TotalPresent: totalPresent,
      TotalAbsent: totalAbsent,
      TotalLeave: totalLeave,
      TotalPercentage: totalPercentage
    },
    subjects
  };
}

function calculateAttendanceInsights(present, total, minPercent) {
  const p = toNumber(present, 0);
  const t = toNumber(total, 0);
  const target = Math.min(99.9, Math.max(1, toNumber(minPercent, 75)));
  const ratio = target / 100;
  const currentPct = t > 0 ? Number(((p / t) * 100).toFixed(2)) : 0;

  // Lectures that can be missed while keeping p / (t + x) >= ratio => x <= (p / ratio) - t
  const canMiss = t > 0 && currentPct >= target
    ? Math.max(0, Math.floor((100 * p) / target - t))
    : 0;

  // Consecutive lectures needed to reach (p + y) / (t + y) >= ratio => y >= (ratio*t - p) / (1 - ratio)
  const needed = currentPct < target
    ? Math.max(0, Math.ceil((target * t - 100 * p) / (100 - target)))
    : 0;

  return {
    currentPercentage: currentPct,
    targetPercentage: target,
    canMiss,
    needed
  };
}

module.exports = {
  safeJsonParse,
  normalizeAttendancePayload,
  calculateAttendanceInsights
};
