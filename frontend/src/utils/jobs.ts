export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}
