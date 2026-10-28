import { amount, anyCurrency, balance, card, currency, date, Institution, on, ref, shape, time } from './template';

const fawryCard = String.raw`(?:my ?fawry |fawry )?card ${card}`;
const arabicBalance = String.raw`(?:.*?الرصيد(?: الحالي| المتاح)? ${balance} ${anyCurrency})?`;

export const fawry: Institution = {
  institution: 'Fawry',
  senderPatterns: [/fawry/i],
  templates: [
    {
      id: 'fawry-bill-ar',
      pattern: shape(String.raw`تم (?:سداد|دفع) (?:فاتورة )?(?<merchant>.+?) بمبلغ ${amount} ${currency}(?:.*?(?:رقم|كود) (?:العملية|المرجع|مرجعي|الإيصال) ${ref})?`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'fawry-bill-en',
      pattern: shape(String.raw`payment of ${currency} ${amount} for (?<merchant>.+?) (?:was|has been) (?:successful|completed)(?:.*?ref(?:erence)?(?: no\.?| number)?:? ${ref})?`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'fawry-recharge-en',
      pattern: shape(String.raw`recharged ${currency} ${amount} for (?<merchant>.+?)(?= mobile| 01\d|[.,]|$)`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'fawry-card-purchase-en',
      pattern: shape(String.raw`purchase - ${currency} ${amount} - (?<merchant>.+?) - ${fawryCard}(?: - ${date}(?: ${time})?)?(?: - bal(?:ance)?:? ${anyCurrency} ${balance})?`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'fawry-card-purchase-ar',
      pattern: shape(String.raw`(?:عملية )?شراء بمبلغ ${amount} ${currency} (?:من|لدى) (?<merchant>.+?) ببطاقة (?:فوري |ماي فوري )?(?:رقم )?${card}(?: بتاريخ ${date}(?: ${time})?)?(?: الرصيد المتاح ${balance} ${anyCurrency})?`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'fawry-wallet-in-ar',
      pattern: shape(String.raw`تم (?:إضافة|اضافة|شحن) ${amount} ${currency} (?:إلى|الى|في) (?:محفظة|محفظتك)(?: ماي فوري)?${arabicBalance}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'fawry-wallet-in-en',
      pattern: shape(String.raw`${currency} ${amount} (?:has been|was) added to your (?:my ?fawry )?wallet(?:.*?balance:? ${anyCurrency} ${balance})?`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'fawry-refund-en',
      pattern: shape(String.raw`refund of ${currency} ${amount} from (?<merchant>.+?) to your ${fawryCard}${on}`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
    {
      id: 'fawry-refund-ar',
      pattern: shape(String.raw`تم (?:استرداد|رد) (?:مبلغ )?${amount} ${currency} من (?<merchant>.+?) (?:إلى|الى) بطاقة (?:فوري )?(?:رقم )?${card}`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
    {
      id: 'fawry-fee-ar',
      pattern: shape(String.raw`تم خصم ${amount} ${currency} (?:قيمة )?(?:رسوم|مصاريف|عمولة)${arabicBalance}`),
      kind: 'fee',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
