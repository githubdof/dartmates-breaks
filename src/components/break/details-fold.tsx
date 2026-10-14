import { CopyField } from "@/components/copy-field";

type Props = {
  description: string;
  prizes: string[];
  perPerson: string;
  picking: string;
  closes: string;
  handles: { venmo?: string; paypal?: string };
  instructions: string;
  hostName: string;
};

/** Everything below the fold (design §5.4). Payment handles are public here, as the design specifies. */
export function DetailsFold({ description, prizes, perPerson, picking, closes, handles, instructions, hostName }: Props) {
  return (
    <details className="mt-6 rounded-card border border-wire bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">Details</summary>
      <div className="space-y-4 px-4 pb-4">
        {description && <p className="max-w-[65ch] whitespace-pre-line">{description}</p>}
        {prizes.length > 0 && <ul className="space-y-1">{prizes.map((p) => <li key={p}>{p}</li>)}</ul>}
        <ul className="space-y-1 text-small text-ink-2">
          <li>{perPerson}</li>
          <li>{picking}</li>
          <li>{closes}</li>
        </ul>
        {(handles.venmo || handles.paypal) && (
          <div className="space-y-2">
            <h3 className="text-small font-semibold">How to pay {hostName}</h3>
            {/* Through CopyField: a blocked clipboard leaves the handle selected for a long press. */}
            {handles.venmo && <CopyField label="Venmo" value={handles.venmo} />}
            {handles.paypal && <CopyField label="PayPal" value={`paypal.me/${handles.paypal}`} />}
          </div>
        )}
        {instructions && <p className="max-w-[65ch] whitespace-pre-line text-small text-ink-2">{instructions}</p>}
        <p className="text-small text-ink-2">Questions? Ask {hostName}.</p>
      </div>
    </details>
  );
}
