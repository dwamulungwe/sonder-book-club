export function combineDateAndTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
