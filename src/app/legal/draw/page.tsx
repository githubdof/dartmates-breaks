export const metadata = { title: "How the draw works" };

export default function DrawExplainerPage() {
  return (
    <main className="mx-auto max-w-prose space-y-4 p-4 text-sm">
      <h1 className="text-xl font-semibold">How the draw works</h1>
      <p>
        <strong>A secret locked before opening.</strong> When a host opens a break, the platform generates a random 32-byte secret and stores it
        encrypted. Only its fingerprint (the commitment, a SHA-256 hash) is shown on the break page and in every claim confirmation. Nobody — not
        the host, not an admin — can see the secret until the draw, and the fingerprint can never be changed.
      </p>
      <p>
        <strong>A public beacon nobody controls.</strong> When the host taps &ldquo;Run draw&rdquo;, the platform picks a future round of the drand
        quicknet beacon, about a minute ahead. drand is a public randomness service run by independent organisations; its value for that round does
        not exist yet when the request is made, so neither the host nor the platform can know or choose it.
      </p>
      <p>
        <strong>Entries frozen at request.</strong> The list of lines and their owners is frozen the moment the draw is requested and cannot be
        changed or withdrawn afterwards. Only line numbers and account ids go into the draw — display names and handles never do.
      </p>
      <p>
        <strong>One shuffle.</strong> The secret, the beacon value, the break id and the frozen entries are combined into a single seed. That seed
        drives one Fisher–Yates shuffle of the lines (HMAC-SHA256 stream with rejection sampling, so every order is equally likely). The first line in
        the result is the winner, then rank 2, and so on. There is no re-roll: running the same inputs again always gives the same order.
      </p>
      <p>
        <strong>Check it yourself.</strong> After the draw the secret is revealed. The result page recomputes the whole draw in your browser from the
        published inputs and checks that the secret matches the fingerprint shown before opening. You can confirm the beacon value on a public drand
        relay (linked under technical details), download the inputs as result.json, or run the open verification script against them.
      </p>
    </main>
  );
}
