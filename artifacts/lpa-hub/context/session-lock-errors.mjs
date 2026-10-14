export function isAccountLockSessionError(error) {
  if (!error || error.status !== 401 || !error.data || typeof error.data !== 'object') return false;
  return error.data.code === 'ACCOUNT_LOCKED' || error.data.code === 'SESSION_REVOKED';
}

export function signInErrorMessage(error) {
  if (error?.status === 423) {
    return error.data?.message || 'Your account is temporarily locked. Please contact an administrator.';
  }
  return error?.message || 'Could not sign in. Please try again.';
}
