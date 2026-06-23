import { getBrowserEnv } from './env.js';

export function isOwnerUser(user) {
  const { ownerUserIds, ownerEmails } = getBrowserEnv();

  if (!user) {
    return { allowed: false, reason: 'No user session.' };
  }

  if (ownerUserIds.length === 0 && ownerEmails.length === 0) {
    return {
      allowed: false,
      reason: 'No owner allowlist is configured.',
    };
  }

  if (ownerUserIds.includes(user.id)) {
    return { allowed: true, reason: 'Matched owner user ID.' };
  }

  const email = (user.email || '').toLowerCase();
  if (email && ownerEmails.includes(email)) {
    return { allowed: true, reason: 'Matched owner email.' };
  }

  return {
    allowed: false,
    reason: `User ${email || user.id} is not in the owner allowlist.`,
  };
}
