/**
 * Presales Attachments — upload, list, delete
 */
const {
  pool, path, fs, authenticate, logger,
  DIVISION,
  upload, checkInquiryOwnership, logActivity,
} = require('./_helpers');

module.exports = function (router) {

  // ── POST /inquiries/:id/attachments ────────────────────────────────────────
  router.post('/inquiries/:id/attachments', authenticate, upload.single('file'), async (req, res) => {
    try {
      const { id } = req.params;
      const { attachment_type = 'other', sample_id = null, analysis_id = null } = req.body;

      const inqCheck = await pool.query(
        'SELECT id FROM mes_presales_inquiries WHERE id = $1 AND division = $2', [id, DIVISION]
      );
      if (inqCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Inquiry not found' });
      }

      const canAccess = await checkInquiryOwnership(req.user, id);
      if (!canAccess) return res.status(403).json({ success: false, error: 'Access denied' });

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const filePath = `/uploads/inquiry-attachments/${req.file.filename}`;
      const result = await pool.query(
        `INSERT INTO inquiry_attachments
           (inquiry_id, file_name, file_path, file_size, mime_type, attachment_type, uploaded_by, uploaded_by_name, sample_id, analysis_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          id, req.file.originalname, filePath, req.file.size, req.file.mimetype,
          attachment_type, req.user.id, req.user.email || `User ${req.user.id}`,
          sample_id || null, analysis_id || null,
        ]
      );

      logger.info(`MES PreSales: attachment uploaded for inquiry #${id}: ${req.file.originalname}`);
      logActivity(parseInt(id), 'attachment_uploaded', {
        file_name: req.file.originalname, attachment_type, file_size: req.file.size,
      }, req.user);
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES PreSales: error uploading attachment', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /inquiries/:id/attachments ─────────────────────────────────────────
  router.get('/inquiries/:id/attachments', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const canAccess = await checkInquiryOwnership(req.user, id);
      if (!canAccess) return res.status(403).json({ success: false, error: 'Access denied' });
      const result = await pool.query(
        `SELECT * FROM inquiry_attachments WHERE inquiry_id = $1 ORDER BY created_at DESC`, [id]
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES PreSales: error fetching attachments', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── DELETE /inquiries/:id/attachments/:attId ───────────────────────────────
  router.delete('/inquiries/:id/attachments/:attId', authenticate, async (req, res) => {
    try {
      const { id, attId } = req.params;

      const att = await pool.query(
        'SELECT * FROM inquiry_attachments WHERE id = $1 AND inquiry_id = $2', [attId, id]
      );
      if (att.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Attachment not found' });
      }

      const canAccess = await checkInquiryOwnership(req.user, id);
      if (!canAccess) return res.status(403).json({ success: false, error: 'Access denied' });

      await pool.query('DELETE FROM inquiry_attachments WHERE id = $1', [attId]);

      const diskPath = path.join(__dirname, '../../..', att.rows[0].file_path);
      fs.unlink(diskPath, (err) => {
        if (err) logger.warn(`Could not delete file: ${diskPath}`, err.message);
      });

      logActivity(parseInt(id), 'attachment_deleted', { file_name: att.rows[0].file_name }, req.user);
      logger.info(`MES PreSales: attachment #${attId} deleted from inquiry #${id}`);
      res.json({ success: true, message: 'Attachment deleted' });
    } catch (err) {
      logger.error('MES PreSales: error deleting attachment', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

};
