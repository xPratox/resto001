const { AuditLog } = require('../models/AuditLog');

async function logAuditEvent({ authUser, action, resourceType, resourceId, metadata = {} }) {
  try {
    if (!authUser || !authUser.usuario) {
      return;
    }

    const username = String(authUser.usuario || '').trim();
    const userId = String(authUser.sub || '').trim();
    const role = String(authUser.rol || '').trim();

    await AuditLog.create({
      action: String(action || '').trim(),
      user: {
        id: userId || null,
        username,
        role,
      },
      resourceType: String(resourceType || '').trim(),
      resourceId: String(resourceId || '').trim(),
      metadata: metadata || {},
    });
  } catch (error) {
    console.error('Audit log error:', error?.message || error);
  }
}

module.exports = {
  logAuditEvent,
};
