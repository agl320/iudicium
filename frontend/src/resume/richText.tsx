import { parseRuns } from "./runs";

export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRuns(text).map((run, index) =>
        run.bold ? <strong key={index}>{run.text}</strong> : <span key={index}>{run.text}</span>,
      )}
    </>
  );
}
