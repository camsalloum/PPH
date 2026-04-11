function normalizeEstimationQueueRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.inquiries)) {
    return payload.inquiries;
  }

  return [];
}

module.exports = {
  normalizeEstimationQueueRows,
};
