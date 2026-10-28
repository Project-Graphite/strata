import { banqueMisr } from './banque-misr';
import { cib } from './cib';
import { fawry } from './fawry';
import { instapay } from './instapay';
import { nbe } from './nbe';
import { Institution } from './template';
import { vodafoneCash } from './vodafone-cash';

export const institutions: Institution[] = [cib, nbe, banqueMisr, vodafoneCash, instapay, fawry];
