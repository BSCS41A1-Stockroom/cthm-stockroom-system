export const PASSWORD_REQUIREMENTS = [
  { label: "8 to 16 characters", test: (value) => value.length >= 8 && value.length <= 16 },
  { label: "At least one uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { label: "At least one lowercase letter", test: (value) => /[a-z]/.test(value) },
  { label: "At least one number", test: (value) => /[0-9]/.test(value) },
  { label: "At least one symbol", test: (value) => /[^A-Za-z0-9\s]/.test(value) },
];

export function passwordErrors(password) {
  if (typeof password !== "string") return PASSWORD_REQUIREMENTS.map((requirement) => requirement.label);
  return PASSWORD_REQUIREMENTS.filter((requirement) => !requirement.test(password))
    .map((requirement) => requirement.label);
}
