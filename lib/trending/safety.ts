// Conservative second-pass filter. The model is asked to screen these subjects too.
export const blockedTopicPatterns: RegExp[] = [
  /\b(?:election|electoral|campaign|partisan|politician|parliament|president|prime minister|political party|ballot|referendum)\b/i,
  /\b(?:war|invasion|terror(?:ism|ist)?|hostage|massacre|genocide|bomb(?:ing)?|missile|shoot(?:ing|er)|stabb(?:ing|ed)|violence|violent|killed|killings|murder|death toll|fatalit(?:y|ies)|deadly|tragedy|disaster)\b/i,
  /\b(?:crime|criminal|murder|fraud|theft|robbery|assault|arrest|charged with|court case|lawsuit|legal advice|lawyer|judge|trial|indictment)\b/i,
  /\b(?:health advice|medical advice|diagnos(?:is|e)|treatment|disease|cancer|epidemic|pandemic|mental health crisis|drug overdose)\b/i,
  /\b(?:celebrity|gossip|paparazzi|affair|divorce|private life)\b/i,
  /\b(?:suicide|self[- ]harm|sexual assault|abuse allegations|child abuse)\b/i,
];

export function isSafeTopic(text: string): boolean {
  return !blockedTopicPatterns.some((pattern) => pattern.test(text));
}
