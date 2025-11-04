import * as chrono from "chrono-node";

export function parseDateWithTimezone(text: string, timezoneOffset = 0) {
  const reference = new Date();
  const ruResult = chrono.ru.parse(text, reference)[0];
  const enResult = chrono.parse(text, reference)[0];
  const result = ruResult || enResult;
  return result
    ? { date: result.date(), wasAmbiguous: result.text.length === 0 }
    : { date: undefined, wasAmbiguous: true };
}
