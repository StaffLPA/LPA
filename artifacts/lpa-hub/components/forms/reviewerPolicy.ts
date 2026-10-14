export const designatedReviewers = [
  { name: 'Taylor Hubbell', email: 'taylor@legendaryprepacademy.com' },
  { name: 'Josh Garcia', email: 'josh@legendaryprepacademy.com' },
  { name: 'Mark Karaviotis', email: 'mark@legendaryprepacademy.com' },
  { name: 'LPA Staff', email: 'staff@legendaryprepacademy.com' },
] as const;
export const designatedReviewerEmails = designatedReviewers.map((p) => p.email);
export const acknowledgementQuestionId = 'r7c20f3f78aed4e46b002b8840857de7e';
export function hasDesignatedReviewers(formName: string, microsoftFormId?: string) {
  return formName === 'LPA External Training & Competition Form' ||
    microsoftFormId === '41OaSypLA0yoKGPBLTVM_zR74t7B3VJCujiML5HMn9RUOFBPUUcxSFFFVTdERjhSS0EwNlRJNkdZQy4u';
}
