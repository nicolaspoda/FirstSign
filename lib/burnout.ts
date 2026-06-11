import type { RiskLevel, Assessment, Checkin } from '@/types/database';
import { detectTrend, wellbeingScore } from './checkin';

export type CBIDimension = 'personal' | 'work' | 'relations';
export type CBIScale = 'frequency' | 'intensity';

export interface CBIQuestion {
  id: string;
  dimension: CBIDimension;
  scale: CBIScale;
  text: string;
  /** True if a high raw answer means LESS burnout and must be inverted before scoring. */
  reversed?: boolean;
}

export interface BurnoutScores {
  personal: number;   // 0–100
  work: number;       // 0–100
  relations: number;  // 0–100
  totalScore: number; // 0–100
}

export interface RiskProfile {
  level: RiskLevel;
  description: string;
  urgency: string;
}

export interface BurnoutProfile {
  dominantDimension: 'personal' | 'work' | 'relations' | 'balanced';
  title: string;
  description: string;
  indicators: string[];
}

// CBI "frequency" answer scale — used by questions asking "how often..."
export const CBI_FREQUENCY_SCALE = [
  'Jamais ou presque jamais',
  'Rarement',
  'Parfois',
  'Souvent',
  'Tout le temps',
] as const;

// CBI "intensity" answer scale — used by questions asking "how much..."
export const CBI_INTENSITY_SCALE = [
  'Pas du tout',
  'Un peu',
  'Moyennement',
  'Beaucoup',
  'Énormément',
] as const;

// Maps an answer button index (0–4) to its raw 0–100 value
export const CBI_SCALE_VALUES = [0, 25, 50, 75, 100] as const;

// Copenhagen Burnout Inventory (CBI) — 19 items in French.
// Order is the recommended display order: dimensions are interleaved to
// avoid response bias (an official CBI recommendation).
// Note: "personnes avec qui vous travaillez" replaces "clients" in the
// relational dimension to adapt the original CBI wording for a general
// professional audience.
export const CBI_QUESTIONS: CBIQuestion[] = [
  { id: 'personal_1', dimension: 'personal', scale: 'frequency', text: 'À quelle fréquence vous sentez-vous fatigué(e) ?' },
  { id: 'work_1', dimension: 'work', scale: 'frequency', text: "Vous sentez-vous vidé(e) à la fin d'une journée de travail ?" },
  { id: 'relation_1', dimension: 'relations', scale: 'intensity', text: 'Trouvez-vous difficile de travailler avec les personnes avec qui vous travaillez ?' },
  { id: 'personal_2', dimension: 'personal', scale: 'frequency', text: 'À quelle fréquence êtes-vous physiquement épuisé(e) ?' },
  { id: 'work_2', dimension: 'work', scale: 'frequency', text: "Êtes-vous épuisé(e) le matin à l'idée d'une nouvelle journée de travail ?" },
  { id: 'relation_2', dimension: 'relations', scale: 'intensity', text: 'Travailler avec ces personnes vous vide-t-il de votre énergie ?' },
  { id: 'personal_3', dimension: 'personal', scale: 'frequency', text: 'À quelle fréquence êtes-vous émotionnellement épuisé(e) ?' },
  { id: 'work_3', dimension: 'work', scale: 'frequency', text: "Avez-vous l'impression que chaque heure de travail est éprouvante ?" },
  { id: 'relation_3', dimension: 'relations', scale: 'intensity', text: 'Trouvez-vous frustrant de travailler avec ces personnes ?' },
  { id: 'personal_4', dimension: 'personal', scale: 'frequency', text: "À quelle fréquence pensez-vous : « Je n'en peux plus » ?" },
  { id: 'work_4', dimension: 'work', scale: 'intensity', text: 'Votre travail vous épuise-t-il émotionnellement ?' },
  { id: 'relation_4', dimension: 'relations', scale: 'intensity', text: "Avez-vous l'impression de donner plus que vous ne recevez dans ces relations professionnelles ?" },
  { id: 'personal_5', dimension: 'personal', scale: 'frequency', text: 'À quelle fréquence vous sentez-vous à bout ?' },
  { id: 'work_5', dimension: 'work', scale: 'intensity', text: 'Votre travail vous frustre-t-il ?' },
  { id: 'relation_5', dimension: 'relations', scale: 'frequency', text: 'Êtes-vous fatigué(e) des personnes avec qui vous travaillez ?' },
  { id: 'personal_6', dimension: 'personal', scale: 'frequency', text: 'À quelle fréquence vous sentez-vous faible et vulnérable à la maladie ?' },
  { id: 'work_6', dimension: 'work', scale: 'intensity', text: 'Vous sentez-vous épuisé(e) par votre travail ?' },
  { id: 'work_7', dimension: 'work', scale: 'frequency', reversed: true, text: 'Avez-vous suffisamment d\'énergie pour votre famille et vos amis pendant votre temps libre ?' },
  { id: 'relation_6', dimension: 'relations', scale: 'frequency', text: 'Vous demandez-vous parfois combien de temps vous pourrez continuer à travailler avec ces personnes ?' },
];

export function calculateScores(answers: number[]): BurnoutScores {
  if (answers.length !== CBI_QUESTIONS.length) {
    throw new Error(`calculateScores expects ${CBI_QUESTIONS.length} answers, got ${answers.length}`);
  }

  const totals: Record<CBIDimension, { sum: number; count: number }> = {
    personal: { sum: 0, count: 0 },
    work: { sum: 0, count: 0 },
    relations: { sum: 0, count: 0 },
  };

  CBI_QUESTIONS.forEach((question, index) => {
    const raw = answers[index] ?? 0;
    const value = question.reversed ? 100 - raw : raw;
    totals[question.dimension].sum += value;
    totals[question.dimension].count += 1;
  });

  const personal = totals.personal.sum / totals.personal.count;
  const work = totals.work.sum / totals.work.count;
  const relations = totals.relations.sum / totals.relations.count;
  const totalScore = (personal + work + relations) / 3;

  return {
    personal: Math.round(personal),
    work: Math.round(work),
    relations: Math.round(relations),
    totalScore: Math.round(totalScore),
  };
}

// CBI risk thresholds, applied to a 0–100 dimension or global score
const RISK_MEDIUM = 50;
const RISK_HIGH = 75;
const RISK_CRITICAL = 90;

export function getScoreLevel(score: number): RiskLevel {
  if (score >= RISK_CRITICAL) return 'critical';
  if (score >= RISK_HIGH) return 'high';
  if (score >= RISK_MEDIUM) return 'medium';
  return 'low';
}

export function getRiskLevel(scores: BurnoutScores): RiskProfile {
  const level = getScoreLevel(scores.totalScore);

  switch (level) {
    case 'critical':
      return {
        level,
        description: 'Épuisement professionnel sévère détecté sur plusieurs dimensions.',
        urgency: 'Consultez un professionnel de santé dès que possible.',
      };
    case 'high':
      return {
        level,
        description: 'Risque élevé de burnout. Des changements significatifs sont nécessaires.',
        urgency: 'Agissez rapidement pour prévenir une dégradation.',
      };
    case 'medium':
      return {
        level,
        description: 'Signes préoccupants de stress professionnel chronique.',
        urgency: 'Mettez en place des stratégies de protection dès maintenant.',
      };
    default:
      return {
        level,
        description: 'Niveaux de stress professionnels gérables.',
        urgency: 'Maintenez vos bonnes pratiques de bien-être.',
      };
  }
}

export interface RiskData {
  checkins: Checkin[];
  latestAssessment: Assessment;
  previousAssessment?: Assessment | null;
  weeksWithoutCheckin: number;
}

export interface RiskScore {
  score: number;
  level: 'Faible' | 'Modéré' | 'Élevé' | 'Critique';
  color: string;
  mainFactors: string[];
}

export function calculateRiskScore(data: RiskData): RiskScore {
  const { checkins, latestAssessment, previousAssessment, weeksWithoutCheckin } = data;

  let score = latestAssessment.total_score;
  const factors: Array<{ label: string; delta: number }> = [];

  const last4 = checkins.slice(0, 4);

  if (last4.length >= 4) {
    const trend = detectTrend(last4);
    if (trend === 'declining') {
      score += 15;
      factors.push({ label: 'Tendance à la dégradation sur 4 semaines', delta: 15 });
    } else if (trend === 'improving') {
      score -= 10;
      factors.push({ label: 'Amélioration régulière sur 4 semaines', delta: -10 });
    }
  }

  if (last4.length >= 2) {
    const avgStress = last4.reduce((s, c) => s + (c.stress ?? 5), 0) / last4.length;
    const avgEnergy = last4.reduce((s, c) => s + (c.energy ?? 5), 0) / last4.length;
    const avgMotivation = last4.reduce((s, c) => s + (c.motivation ?? 5), 0) / last4.length;

    if (avgStress > 7) {
      score += 10;
      factors.push({ label: `Stress élevé ces dernières semaines (${avgStress.toFixed(1)}/10)`, delta: 10 });
    } else if (avgStress < 4) {
      score -= 5;
      factors.push({ label: 'Stress bien maîtrisé', delta: -5 });
    }

    if (avgEnergy < 4) {
      score += 10;
      factors.push({ label: `Énergie en baisse (${avgEnergy.toFixed(1)}/10 en moyenne)`, delta: 10 });
    } else if (avgEnergy > 7) {
      score -= 8;
      factors.push({ label: 'Bonne énergie maintenue', delta: -8 });
    }

    if (avgMotivation < 4) {
      score += 5;
      factors.push({ label: `Motivation faible (${avgMotivation.toFixed(1)}/10)`, delta: 5 });
    }
  }

  if (previousAssessment && latestAssessment.total_score > previousAssessment.total_score) {
    const delta = Math.round(latestAssessment.total_score - previousAssessment.total_score);
    score += 8;
    factors.push({ label: `Score CBI en hausse de ${delta} pts vs diagnostic précédent`, delta: 8 });
  }

  if (weeksWithoutCheckin >= 3) {
    score += 8;
    factors.push({ label: `${weeksWithoutCheckin} semaines sans check-in`, delta: 8 });
  }

  const finalScore = Math.min(100, Math.max(0, score));

  const mainFactors = factors
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
    .map(f => f.label);

  if (mainFactors.length === 0) {
    mainFactors.push('Basé sur le score du dernier diagnostic');
  }

  let level: RiskScore['level'];
  let color: string;

  if (finalScore >= 76) {
    level = 'Critique';
    color = '#991B1B';
  } else if (finalScore >= 56) {
    level = 'Élevé';
    color = '#EF4444';
  } else if (finalScore >= 31) {
    level = 'Modéré';
    color = '#F59E0B';
  } else {
    level = 'Faible';
    color = '#1D9E75';
  }

  return { score: finalScore, level, color, mainFactors };
}

export function getBurnoutProfile(scores: BurnoutScores): BurnoutProfile {
  const { personal, work, relations } = scores;

  const maxScore = Math.max(personal, work, relations);
  const minScore = Math.min(personal, work, relations);
  const isBalanced = maxScore - minScore < 15 && maxScore < RISK_MEDIUM;

  if (isBalanced) {
    return {
      dominantDimension: 'balanced',
      title: 'Profil équilibré',
      description: 'Vos trois dimensions sont dans des zones acceptables. Vous gérez bien votre charge actuelle.',
      indicators: [
        'Énergie personnelle préservée',
        'Charge de travail soutenable',
        'Relations professionnelles globalement positives',
      ],
    };
  }

  if (personal >= work && personal >= relations) {
    return {
      dominantDimension: 'personal',
      title: 'Épuisement personnel dominant',
      description: 'Votre fatigue physique et émotionnelle générale est votre principal signal d\'alerte, au-delà de votre seul contexte professionnel.',
      indicators: [
        'Fatigue physique et émotionnelle persistante',
        'Sentiment d\'être à bout',
        'Vulnérabilité accrue à la maladie',
      ],
    };
  }

  if (work >= personal && work >= relations) {
    return {
      dominantDimension: 'work',
      title: 'Épuisement professionnel dominant',
      description: 'Votre travail est la principale source de votre épuisement : il vous vide d\'énergie et alimente votre fatigue.',
      indicators: [
        'Sentiment d\'être vidé(e) par le travail',
        'Frustration liée à l\'activité professionnelle',
        'Difficulté à récupérer après le travail',
      ],
    };
  }

  return {
    dominantDimension: 'relations',
    title: 'Épuisement relationnel dominant',
    description: 'Vos relations professionnelles sont votre principal facteur d\'épuisement : elles vous coûtent plus qu\'elles ne vous apportent.',
    indicators: [
      'Relations professionnelles éprouvantes',
      'Sentiment de donner plus que vous ne recevez',
      'Fatigue liée aux personnes avec qui vous travaillez',
    ],
  };
}
