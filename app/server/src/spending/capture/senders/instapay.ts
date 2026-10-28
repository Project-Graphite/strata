import { amount, arabicMerchant, card, currency, dated, Institution, merchant, on, ref, shape } from './template';

const fromAccount = String.raw`(?: from your (?:account|card) ${card})?`;
const reference = String.raw`(?:\.? Ref(?:erence)?:? ${ref})?`;

export const instapay: Institution = {
  institution: 'InstaPay',
  senderPatterns: [/insta ?pay/i, /egyptianbanks/i, /انستاباي|إنستاباي/],
  templates: [
    {
      id: 'instapay-card-payment-en',
      pattern: shape(String.raw`paid ${currency} ${amount} to your credit card (?:\*+|x+ ?)?\d{4} from your (?:account|card) ${card}${on}${reference}`),
      kind: 'card_payment',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'instapay-bill-en',
      pattern: shape(String.raw`paid ${currency} ${amount} for (?<merchant>.+?) bill${fromAccount}${on}${reference}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'instapay-pay-en',
      pattern: shape(String.raw`paid ${currency} ${amount} to ${merchant}(?: (?:using|via) InstaPay(?: QR)?)?${fromAccount}${on}${reference}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'instapay-sent-en',
      pattern: shape(String.raw`transferred ${currency} ${amount} to (?<merchant>.+?) from your (?:account|card) ${card}${on}${reference}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'instapay-received-en',
      pattern: shape(String.raw`received ${currency} ${amount} from ${merchant}(?: to your account ${card})?(?: via InstaPay)?${on}${reference}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'instapay-sent-you-en',
      pattern: shape(String.raw`^(?<merchant>[a-z؀-ۿ][a-z؀-ۿ .'-]*?) sent you ${currency} ${amount}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'instapay-sent-ar',
      pattern: shape(String.raw`تم تحويل (?:مبلغ )?${amount} ${currency} (?:إلى|الى|لصالح) ${arabicMerchant}(?: بنجاح)?(?: من حسابك (?:رقم )?${card})?${dated}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'instapay-received-ar',
      pattern: shape(String.raw`(?:وصلك|وصلتك|تم استلام|تم إضافة|تم اضافة)(?: مبلغ)? ${amount} ${currency}(?: (?:إلى|الى) حسابك ${card})? من ${arabicMerchant}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
  ],
};
