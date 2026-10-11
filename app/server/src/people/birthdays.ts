const twoDigits = (value: number) => String(value).padStart(2, '0');
const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export function birthdayIn(year: number, month: number, day: number) {
  return `${year}-${twoDigits(month)}-${twoDigits(month === 2 && day === 29 && !isLeap(year) ? 28 : day)}`;
}

export function nextBirthday(month: number, day: number, today: string) {
  const year = Number(today.slice(0, 4));
  const thisYear = birthdayIn(year, month, day);
  return thisYear >= today ? thisYear : birthdayIn(year + 1, month, day);
}

export function birthdaysBetween(month: number, day: number, from: string, to: string) {
  const years = Array.from({ length: Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 1 }, (_, index) => Number(from.slice(0, 4)) + index);
  return years.map((year) => birthdayIn(year, month, day)).filter((date) => date >= from && date < to);
}

export function validBirthday(month: number, day: number) {
  return day <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}
