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

    // Use ERP-provided Percentage directly; calculate only if missing
    const percentage = hasNumericValue(row.Percentage)
      ? Number(toNumber(row.Percentage, 0).toFixed(2))
      : Number((totalLecture > 0 ? (totalPresent / totalLecture) * 100 : 0).toFixed(2));

    return {
      Subject: row.Subject || 'Unknown Subject',
      SubjectCode: row.SubjectCode || '',
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

  // Use ERP-provided TotalPercentage directly; calculate only if missing
  const totalPercentage = hasNumericValue(stateObj.TotalPercentage)
    ? Number(toNumber(stateObj.TotalPercentage, 0).toFixed(2))
    : Number((totalLecture > 0 ? (totalPresent / totalLecture) * 100 : 0).toFixed(2));

  return {
    overall: {
      TotalLecture: totalLecture,
      TotalPresent: totalPresent,
      TotalAbsent: totalAbsent,
      TotalLeave: totalLeave,
      TotalPercentage: totalPercentage
    },
    subjects
  };
}

module.exports = {
  safeJsonParse,
  normalizeAttendancePayload
};
