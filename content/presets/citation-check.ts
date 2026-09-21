import type { Preset } from './types'

/**
 * One Choice question that checks a citation against its source, from
 * docs.typesafe.ai/cookbooks/citation_check.
 *
 * A string match catches the quotes that are not in the document at all, and
 * no model is needed for that. The hard case is the quote that is in the
 * source word for word while the claim built on top of it is wrong, and that
 * is what this question is for: read the section the quote came from, and say
 * whether it supports the claim, contradicts it, or has nothing to do with it.
 *
 * `says_nothing` is the option doing the quiet work. Without it the model has
 * to choose between supports and contradicts for a section that addresses
 * neither, and the probability would pile up on whichever reads closer. With
 * it, a citation that is merely irrelevant comes back at low confidence and
 * goes to a person — which is what happened to both of the unsupported ones.
 *
 * The state is an object rather than a string. Two labelled fields, `claim`
 * and `section`, keep the question about the relation between them; run the
 * same text concatenated into one blob and the boundary blurs.
 *
 * Nothing here is recorded. The cookbook publishes each verdict and its
 * confidence in a table but never the probability distribution underneath, and
 * a Choice answer without its probabilities would be a fabrication dressed as
 * a replay. The published figures are in each description; press run for the
 * rest.
 */
export const citationCheck: Preset = {
  slug: 'citation-check',
  title: 'Citation check',
  category: 'guardrails',
  teaches: 'Does the cited section actually support the claim, or just contain the quote?',
  patterns: ['grounded verification', 'confidence routing', 'structured state'],

  questions: {
    relation: {
      type: 'choice',
      instructions: 'How does the section relate to the claim?',
      criteria: {
        supports: 'The section states the claim or directly implies that it is true',
        contradicts: 'The section states the opposite of the claim or implies it is false',
        says_nothing: 'The section does not address what the claim asserts, either way',
      },
    },
  },

  // The cookbook's AUTO_ACCEPT: at or above 0.8 the verdict stands, below it a
  // human confirms before anything acts. There is no third band — act and
  // review sit on the same number — because "auto or a person" is the whole
  // decision. Start high and lower it as you learn how the model reads your
  // own documents.
  policy: {
    rules: [{ q: 'relation', kind: 'band', act: 0.8, review: 0.0 }],
  },

  variants: [
    {
      id: 'contradicted',
      label: 'Quoted correctly, concluded wrongly',
      description:
        'The quote is in RFC 7519 word for word, and the same paragraph ends "Use of this claim is OPTIONAL". The cookbook records this as contradicts at confidence 0.99 — the verdict stands without review.',
      state: {
        claim: 'Every JWT must include an expiration time; a token without "exp" is not valid.',
        section:
          '4.1.4.  "exp" (Expiration Time) Claim\n\n   The "exp" (expiration time) claim identifies the expiration time on\n   or after which the JWT MUST NOT be accepted for processing.  The\n   processing of the "exp" claim requires that the current date/time\n   MUST be before the expiration date/time listed in the "exp" claim.\n\n   Implementers MAY provide for some small leeway, usually no more than\n   a few minutes, to account for clock skew.  Its value MUST be a number\n   containing a NumericDate value.  Use of this claim is OPTIONAL.',
      },
      recorded: null,
    },
    {
      id: 'supported',
      label: 'An accurate citation',
      description:
        'What a good citation looks like: the section states the claim almost in its own words. The cookbook records supports at confidence 0.95, one of four accurate citations that all came back at 0.93 or higher.',
      state: {
        claim:
          "If a validator does not find itself in a token's audience list, it has to reject the token.",
        section:
          '4.1.3.  "aud" (Audience) Claim\n\n   The "aud" (audience) claim identifies the recipients that the JWT is\n   intended for.  Each principal intended to process the JWT MUST\n   identify itself with a value in the audience claim.  If the principal\n   processing the claim does not identify itself with a value in the\n   "aud" claim when this claim is present, then the JWT MUST be\n   rejected.  In the general case, the "aud" value is an array of case-\n   sensitive strings, each containing a StringOrURI value.  In the\n   special case when the JWT has one audience, the "aud" value MAY be a\n   single case-sensitive string containing a StringOrURI value.  The\n   interpretation of audience values is generally application specific.\n   Use of this claim is OPTIONAL.',
      },
      recorded: null,
    },
    {
      id: 'unsupported-pii',
      label: 'Right document, wrong section',
      description:
        'The claim is about encrypting personal data; the section is about what the "sub" claim identifies. Nothing here says the claim is false, and nothing says it is true. The cookbook records says_nothing at confidence 0.27, its lowest, and sends it to a human. Note: the cookbook names this citation and its numbers but does not publish its claim text or which section it quoted, so the pair above is ours, written to the same shape — a quote that really is in the source, in a section with nothing to say about the claim.',
      state: {
        claim:
          'RFC 7519 requires that any personally identifying information carried in a JWT claim be encrypted.',
        section:
          '4.1.2.  "sub" (Subject) Claim\n\n   The "sub" (subject) claim identifies the principal that is the\n   subject of the JWT.  The claims in a JWT are normally statements\n   about the subject.  The subject value MUST either be scoped to be\n   locally unique in the context of the issuer or be globally unique.\n   The processing of this claim is generally application specific.  The\n   "sub" value is a case-sensitive string containing a StringOrURI\n   value.  Use of this claim is OPTIONAL.',
      },
      recorded: null,
    },
    {
      id: 'unsupported-iat',
      label: 'A claim with no quote at all',
      description:
        'This citation names a section and quotes nothing, so there is no string match to run and the model gets the whole section cold. The claim invents a validation rule the section never mentions. The cookbook records says_nothing at confidence 0.56 — the right verdict, held back for review because the model is not sure enough of it.',
      state: {
        claim: 'The "iat" claim requires validators to reject tokens whose issue time is in the future.',
        section:
          '4.1.6.  "iat" (Issued At) Claim\n\n   The "iat" (issued at) claim identifies the time at which the JWT was\n   issued.  This claim can be used to determine the age of the JWT.  Its\n   value MUST be a number containing a NumericDate value.  Use of this\n   claim is OPTIONAL.',
      },
      recorded: null,
    },
  ],
}
