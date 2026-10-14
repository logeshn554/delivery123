export function passwordStrength(password: string): number {
  if (!password) return 0;
  const variedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumberOrSymbol = /[0-9]|[^A-Za-z0-9]/.test(password);
  return Number(password.length >= 8)
    + Number(password.length >= 12)
    + Number(variedCase)
    + Number(hasNumberOrSymbol);
}

export function passwordStrengthLabel(score: number): string {
  if (score >= 4) return 'Strong';
  if (score >= 2) return 'Fair';
  return 'Weak';
}
