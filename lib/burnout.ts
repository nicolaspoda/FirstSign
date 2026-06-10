import type { RiskLevel } from '@/types/database';

export interface MBIQuestion {
  id: number;
  text: string;
  dimension: 'exhaustion' | 'cynicism' | 'efficacy';
}

export interface BurnoutScores {
  exhaustion: number;  // 0–54
  cynicism: number;    // 0–30
  efficacy: number;    // 0–48 (higher = better)
  totalScore: number;  // 0–100 normalized burnout index
}

export interface RiskProfile {
  level: RiskLevel;
  description: string;
  urgency: string;
}

export interface BurnoutProfile {
  dominantDimension: 'exhaustion' | 'cynicism' | 'low_efficacy' | 'balanced';
  title: string;
  description: string;
  indicators: string[];
}

// MBI frequency scale labels (0–6)
export const MBI_SCALE = [
  'Jamais',
  'Quelques fois par an ou moins',
  'Une fois par mois ou moins',
  'Quelques fois par mois',
  'Une fois par semaine',
  'Quelques fois par semaine',
  'Chaque jour',
] as const;

// Standard MBI-HSS (Human Services Survey) — 22 items in French
// Subscale mapping (1-indexed question numbers):
//   Exhaustion  (EE): 1,2,3,6,8,13,14,16,20  → array indices [0,1,2,5,7,12,13,15,19]
//   Cynicism    (DP): 5,10,11,15,22           → array indices [4,9,10,14,21]
//   Efficacy    (PA): 4,7,9,12,17,18,19,21    → array indices [3,6,8,11,16,17,18,20]
export const MBI_QUESTIONS: MBIQuestion[] = [
  { id: 1,  dimension: 'exhaustion', text: 'Je me sens émotionnellement vidé(e) par mon travail.' },
  { id: 2,  dimension: 'exhaustion', text: 'Je me sens à bout à la fin d\'une journée de travail.' },
  { id: 3,  dimension: 'exhaustion', text: 'Je me sens fatigué(e) quand je me lève le matin et que je dois affronter une autre journée au travail.' },
  { id: 4,  dimension: 'efficacy',   text: 'Je peux facilement comprendre ce que mes interlocuteurs ressentent.' },
  { id: 5,  dimension: 'cynicism',   text: 'Je sens que je traite certains de mes interlocuteurs comme des objets impersonnels.' },
  { id: 6,  dimension: 'exhaustion', text: 'Travailler avec des gens tout au long de la journée est vraiment une contrainte pour moi.' },
  { id: 7,  dimension: 'efficacy',   text: 'Je m\'occupe très efficacement des problèmes de mes interlocuteurs.' },
  { id: 8,  dimension: 'exhaustion', text: 'Je me sens épuisé(e) par mon travail.' },
  { id: 9,  dimension: 'efficacy',   text: 'J\'ai l\'impression, à travers mon travail, d\'avoir une influence positive sur les gens.' },
  { id: 10, dimension: 'cynicism',   text: 'Je suis devenu(e) plus insensible aux gens depuis que j\'ai ce travail.' },
  { id: 11, dimension: 'cynicism',   text: 'Je crains que ce travail ne m\'endurcisse émotionnellement.' },
  { id: 12, dimension: 'efficacy',   text: 'Je me sens plein(e) d\'entrain.' },
  { id: 13, dimension: 'exhaustion', text: 'Je me sens frustré(e) par mon travail.' },
  { id: 14, dimension: 'exhaustion', text: 'J\'ai le sentiment de travailler trop dur dans mon travail.' },
  { id: 15, dimension: 'cynicism',   text: 'Je ne me soucie pas vraiment de ce qui arrive à certains de mes interlocuteurs.' },
  { id: 16, dimension: 'exhaustion', text: 'Travailler en contact direct avec les gens me stresse trop.' },
  { id: 17, dimension: 'efficacy',   text: 'Je réussis facilement à créer une atmosphère détendue avec mes interlocuteurs.' },
  { id: 18, dimension: 'efficacy',   text: 'Je me sens ragaillardi(e) lorsque, dans mon travail, j\'ai été proche de mes interlocuteurs.' },
  { id: 19, dimension: 'efficacy',   text: 'J\'ai accompli beaucoup de choses qui en valent la peine dans ce travail.' },
  { id: 20, dimension: 'exhaustion', text: 'Je me sens au bout du rouleau.' },
  { id: 21, dimension: 'efficacy',   text: 'Dans mon travail, je résous calmement les problèmes émotionnels.' },
  { id: 22, dimension: 'cynicism',   text: 'J\'ai l\'impression que mes interlocuteurs me rendent responsable de certains de leurs problèmes.' },
];

const EE_INDICES = [0, 1, 2, 5, 7, 12, 13, 15, 19];
const DP_INDICES = [4, 9, 10, 14, 21];
const PA_INDICES = [3, 6, 8, 11, 16, 17, 18, 20];

const EE_MAX = 54;
const DP_MAX = 30;
const PA_MAX = 48;

export function calculateScores(answers: number[]): BurnoutScores {
  if (answers.length !== 22) {
    throw new Error(`calculateScores expects 22 answers, got ${answers.length}`);
  }

  const exhaustion = EE_INDICES.reduce((sum, i) => sum + (answers[i] ?? 0), 0);
  const cynicism   = DP_INDICES.reduce((sum, i) => sum + (answers[i] ?? 0), 0);
  const efficacy   = PA_INDICES.reduce((sum, i) => sum + (answers[i] ?? 0), 0);

  // Normalize each dimension to 0–100 where 100 = maximum burnout
  const eeNorm = (exhaustion / EE_MAX) * 100;
  const dpNorm = (cynicism   / DP_MAX) * 100;
  const paInv  = ((PA_MAX - efficacy) / PA_MAX) * 100; // low efficacy = high burnout

  const totalScore = Math.round((eeNorm + dpNorm + paInv) / 3);

  return { exhaustion, cynicism, efficacy, totalScore };
}

// Standard Maslach cutoffs
const EE_MOD = 17; const EE_HIGH = 27;
const DP_MOD = 7;  const DP_HIGH = 13;
const PA_LOW = 31; const PA_MOD  = 38;

export function getRiskLevel(scores: BurnoutScores): RiskProfile {
  const { exhaustion, cynicism, efficacy } = scores;

  const eeHigh = exhaustion >= EE_HIGH;
  const eeMod  = exhaustion >= EE_MOD;
  const dpHigh = cynicism   >= DP_HIGH;
  const dpMod  = cynicism   >= DP_MOD;
  const paLow  = efficacy   <= PA_LOW;
  const paMod  = efficacy   <= PA_MOD;

  if (eeHigh && (dpHigh || paLow)) {
    return {
      level: 'critical',
      description: 'Épuisement professionnel sévère détecté sur plusieurs dimensions.',
      urgency: 'Consultez un professionnel de santé dès que possible.',
    };
  }

  if (eeHigh || (dpHigh && paLow)) {
    return {
      level: 'high',
      description: 'Risque élevé de burnout. Des changements significatifs sont nécessaires.',
      urgency: 'Agissez rapidement pour prévenir une dégradation.',
    };
  }

  if (eeMod || dpMod || paMod) {
    return {
      level: 'medium',
      description: 'Signes préoccupants de stress professionnel chronique.',
      urgency: 'Mettez en place des stratégies de protection dès maintenant.',
    };
  }

  return {
    level: 'low',
    description: 'Niveaux de stress professionnels gérables.',
    urgency: 'Maintenez vos bonnes pratiques de bien-être.',
  };
}

export function getBurnoutProfile(scores: BurnoutScores): BurnoutProfile {
  const { exhaustion, cynicism, efficacy } = scores;

  const eeNorm = (exhaustion / EE_MAX) * 100;
  const dpNorm = (cynicism   / DP_MAX) * 100;
  const paInv  = ((PA_MAX - efficacy) / PA_MAX) * 100;

  const maxScore = Math.max(eeNorm, dpNorm, paInv);
  const minScore = Math.min(eeNorm, dpNorm, paInv);
  const isBalanced = maxScore - minScore < 15 && maxScore < 45;

  if (isBalanced) {
    return {
      dominantDimension: 'balanced',
      title: 'Profil équilibré',
      description: 'Vos trois dimensions sont dans des zones acceptables. Vous gérez bien votre charge professionnelle.',
      indicators: [
        'Énergie émotionnelle préservée',
        'Engagement professionnel maintenu',
        'Sentiment d\'efficacité intact',
      ],
    };
  }

  if (eeNorm >= dpNorm && eeNorm >= paInv) {
    return {
      dominantDimension: 'exhaustion',
      title: 'Épuisement émotionnel dominant',
      description: 'Vous vous sentez vidé(e) et à bout. La fatigue émotionnelle est votre principal signal d\'alerte.',
      indicators: [
        'Fatigue persistante au quotidien',
        'Sentiment d\'être à bout en fin de journée',
        'Difficulté à récupérer le matin',
      ],
    };
  }

  if (dpNorm >= eeNorm && dpNorm >= paInv) {
    return {
      dominantDimension: 'cynicism',
      title: 'Cynisme et détachement dominant',
      description: 'Vous avez développé une distance émotionnelle avec votre travail et vos interlocuteurs.',
      indicators: [
        'Détachement progressif des collègues',
        'Irritabilité et indifférence accrue',
        'Perte d\'intérêt pour les résultats',
      ],
    };
  }

  return {
    dominantDimension: 'low_efficacy',
    title: 'Perte d\'efficacité personnelle dominante',
    description: 'Vous doutez de votre compétence et de votre impact dans votre rôle professionnel.',
    indicators: [
      'Sentiment d\'incompétence ou d\'inutilité',
      'Perte de confiance en soi professionnelle',
      'Remise en question de vos accomplissements',
    ],
  };
}
