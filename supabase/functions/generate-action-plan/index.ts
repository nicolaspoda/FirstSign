import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActionTemplate {
  title: string;
  description: string;
  duration: string;
  category: string;
}

// 8 weeks × 3 actions per risk level — progressive difficulty (week 1 = entry, week 8 = advanced)
const PLAN_TEMPLATES: Record<string, ActionTemplate[][]> = {
  critical: [
    // Semaine 1 — Arrêt d'urgence
    [
      { title: 'Consulter un médecin', description: 'Prenez rendez-vous avec votre médecin traitant pour évaluer votre état et discuter d\'un éventuel arrêt de travail.', duration: '1 heure', category: 'santé' },
      { title: 'Poser 2 jours de congé', description: 'Déconnectez-vous complètement 48h : aucun email, aucun Slack. Dormez, mangez, sortez en nature.', duration: '2 jours', category: 'repos' },
      { title: 'Identifier une tâche à abandonner', description: 'Choisissez une responsabilité non-essentielle et communiquez sa suppression ou délégation à votre équipe.', duration: '30 min', category: 'limites' },
    ],
    // Semaine 2 — Stabilisation basique
    [
      { title: 'Dormir ≥ 8h chaque nuit', description: 'Couchez-vous 30 min plus tôt que d\'habitude. Éteignez tous les écrans 1h avant le coucher.', duration: 'Chaque soir', category: 'sommeil' },
      { title: 'Déjeuner sans écran', description: 'Quittez votre bureau et mangez loin de votre téléphone et ordinateur chaque midi.', duration: '45 min/jour', category: 'récupération' },
      { title: 'Parler à un proche de confiance', description: 'Exprimez ce que vous vivez à quelqu\'un en qui vous avez confiance. Partager allège le fardeau émotionnel.', duration: '1 heure', category: 'soutien' },
    ],
    // Semaine 3 — Récupération active
    [
      { title: 'Marcher 20 min en plein air chaque matin', description: 'Avant d\'allumer l\'ordinateur, sortez marcher. L\'air frais et le mouvement doux abaissent le cortisol.', duration: '20 min/jour', category: 'mouvement' },
      { title: 'Couper les notifications après 19h', description: 'Configurez votre téléphone en "Ne pas déranger" à partir de 19h. Posez la règle à votre entourage professionnel.', duration: '5 min (configuration)', category: 'limites' },
      { title: 'Respiration abdominale le soir', description: 'Allongez-vous et pratiquez 10 respirations profondes (4 sec inspiration, 6 sec expiration) avant de dormir.', duration: '5 min/soir', category: 'relaxation' },
    ],
    // Semaine 4 — Reconstruction des ressources
    [
      { title: 'Planifier une activité plaisir', description: 'Choisissez une activité que vous aimiez avant le burnout et inscrivez-la dans votre agenda comme un RDV non-négociable.', duration: '1–2 h/semaine', category: 'plaisir' },
      { title: 'Préparer vos repas le week-end', description: 'Cuisinez en avance le dimanche pour avoir des repas équilibrés disponibles sans effort en semaine.', duration: '1 heure', category: 'nutrition' },
      { title: 'Journal de gratitude du soir', description: 'Écrivez chaque soir 3 choses positives de la journée, aussi petites soient-elles. Entraîne le cerveau à détecter le positif.', duration: '10 min/soir', category: 'journaling' },
    ],
    // Semaine 5 — Gestion du stress
    [
      { title: 'Méditation guidée 10 min chaque matin', description: 'Utilisez une app (Petit Bambou, Headspace, Calm) pour une méditation guidée débutant avant de commencer votre journée.', duration: '10 min/jour', category: 'mindfulness' },
      { title: 'Règle des 3 priorités par jour', description: 'Chaque matin, identifiez les 3 tâches les plus importantes. Ne faites que celles-là avant d\'en ajouter d\'autres.', duration: '5 min/matin', category: 'organisation' },
      { title: 'Pause toutes les 90 min', description: 'Programmez une alarme toutes les 90 min pour faire une pause de 5 min : buvez de l\'eau, étirez-vous, regardez au loin.', duration: '5 min × 5/jour', category: 'récupération' },
    ],
    // Semaine 6 — Transformation du rapport au travail
    [
      { title: 'Entretien avec votre manager', description: 'Demandez un entretien pour discuter de votre charge. Préparez 3 points concrets d\'ajustement à proposer.', duration: '30–45 min', category: 'communication' },
      { title: 'Identifier vos vampires d\'énergie', description: 'Listez les 3 situations/personnes/tâches qui vous vident le plus. Réfléchissez à comment les réduire ou les transformer.', duration: '30 min', category: 'analyse' },
      { title: 'Rituel de fin de journée', description: 'Créez un signal de déconnexion (ranger le bureau, noter les tâches du lendemain, fermer l\'ordinateur). Répétez-le chaque soir.', duration: '15 min/soir', category: 'limites' },
    ],
    // Semaine 7 — Habitudes durables
    [
      { title: 'Sport 30 min × 3 cette semaine', description: 'Choisissez une activité cardio modérée (marche rapide, vélo, natation). L\'exercice régulier est la meilleure thérapie anti-burnout.', duration: '30 min × 3', category: 'mouvement' },
      { title: 'Pleine conscience avant les réunions', description: 'Avant chaque réunion importante, prenez 2 min pour respirer profondément et définir votre intention pour la réunion.', duration: '2 min', category: 'mindfulness' },
      { title: 'Bilan hebdomadaire du vendredi', description: 'Chaque vendredi en fin de journée, notez : 3 réussites, 1 apprentissage, 1 ajustement pour la semaine suivante.', duration: '15 min/semaine', category: 'bilan' },
    ],
    // Semaine 8 — Système de prévention
    [
      { title: 'Définir vos 3 signaux d\'alerte', description: 'Identifiez les premiers signes qui indiquent que vous rechargez vers l\'épuisement (irritabilité, insomnies, etc.). Écrivez-les.', duration: '30 min', category: 'prévention' },
      { title: 'Réseau de soutien formalisé', description: 'Identifiez 2 personnes de confiance et convenez explicitement qu\'elles peuvent vous alerter si elles vous voient vous dégrader.', duration: '1 heure', category: 'soutien' },
      { title: 'Programmer votre prochain diagnostic', description: 'Bloquez une date dans 3 mois pour refaire votre évaluation CBI et mesurer votre progression.', duration: '5 min', category: 'suivi' },
    ],
  ],

  high: [
    // Semaine 1 — Réduction immédiate de la surcharge
    [
      { title: 'Déléguer ou supprimer 2 responsabilités', description: 'Faites la liste de tout ce que vous faites. Identifiez 2 tâches à déléguer ou à sortir complètement de votre périmètre.', duration: '45 min', category: 'charge' },
      { title: 'Activer "Ne pas déranger" après 19h', description: 'Configurez votre téléphone en mode silence professionnel de 19h à 8h. Prévenez vos collègues.', duration: '5 min (configuration)', category: 'limites' },
      { title: 'Pause déjeuner hors du bureau', description: 'Quittez physiquement votre espace de travail pour déjeuner. Sans téléphone. Chaque jour cette semaine.', duration: '45 min/jour', category: 'récupération' },
    ],
    // Semaine 2 — Récupération de base
    [
      { title: 'Heure de coucher fixe', description: 'Choisissez une heure de coucher et respectez-la 6 jours sur 7. La régularité est plus importante que la durée.', duration: 'Chaque soir', category: 'sommeil' },
      { title: 'Supprimer les notifications email le week-end', description: 'Retirez l\'accès email de votre téléphone jusqu\'au lundi matin. Une expérience de 48h pour mesurer l\'impact.', duration: '5 min (configuration)', category: 'limites' },
      { title: 'Étirements matinaux avant l\'ordinateur', description: 'Avant d\'allumer votre écran, faites 10 min d\'étirements doux pour vous ancrer dans votre corps.', duration: '10 min/matin', category: 'mouvement' },
    ],
    // Semaine 3 — Récupération active
    [
      { title: '3 séances de sport aérobie', description: 'Marche rapide, vélo, natation ou course. 30 min d\'intensité modérée. L\'exercice aérobie réduit l\'anxiété de 48%.', duration: '30 min × 3', category: 'mouvement' },
      { title: '1h en plein air chaque jour', description: 'Planifiez une sortie en plein air (parc, forêt, jardin) de 1h minimum chaque jour. La nature réduit le cortisol.', duration: '1h/jour', category: 'nature' },
      { title: 'Cohérence cardiaque 3 fois par jour', description: 'Inspirez 5 sec, expirez 5 sec pendant 5 min. À faire le matin, après le déjeuner, et avant de dormir.', duration: '5 min × 3', category: 'respiration' },
    ],
    // Semaine 4 — Optimisation du travail
    [
      { title: 'Bloquer 90 min de travail profond', description: 'Réservez une plage quotidienne sans réunion ni interruption pour votre tâche la plus importante. Téléphone en silencieux.', duration: '90 min/jour', category: 'focus' },
      { title: 'To-do list du lendemain le soir', description: 'Avant de quitter le travail, écrivez les 3 tâches prioritaires du lendemain. Votre cerveau lâche prise plus facilement.', duration: '10 min/soir', category: 'organisation' },
      { title: 'Dire non à une demande cette semaine', description: 'Identifiez une demande non-urgente et déclinez-la poliment. Pratiquez la phrase : "Je ne peux pas le faire cette semaine."', duration: 'Ponctuel', category: 'limites' },
    ],
    // Semaine 5 — Décompression mentale
    [
      { title: 'Journal du soir (10 min)', description: 'Chaque soir, écrivez librement : ce qui vous a pesé, ce qui vous a nourri, ce que vous ressentez. Sans filtre, sans relecture.', duration: '10 min/soir', category: 'journaling' },
      { title: 'Méditation de pleine conscience 10 min', description: 'Utilisez une app guidée chaque matin. Concentrez-vous sur la respiration. Les pensées reviendront — c\'est normal, ramenez l\'attention.', duration: '10 min/matin', category: 'mindfulness' },
      { title: 'Activité ressourçante 2× cette semaine', description: 'Qu\'est-ce qui vous recharge vraiment ? (Lecture, musique, baignade...). Planifiez-le 2 fois comme un RDV.', duration: 'Variable', category: 'ressourcement' },
    ],
    // Semaine 6 — Qualité du sommeil
    [
      { title: 'Routine du soir : zéro écran 1h avant le coucher', description: 'La lumière bleue perturbe la mélatonine. Remplacez l\'écran par de la lecture, de la musique douce ou un bain.', duration: '1h/soir', category: 'sommeil' },
      { title: 'Réduire la caféine après 14h', description: 'La caféine a une demi-vie de 6h. Aucune boisson caféinée après 14h cette semaine. Notez l\'effet sur votre sommeil.', duration: 'Quotidien', category: 'nutrition' },
      { title: 'Relaxation musculaire progressive au coucher', description: 'Allongé(e), contractez puis relâchez chaque groupe musculaire de bas en haut. Élimine la tension physique résiduelle.', duration: '15 min/soir', category: 'relaxation' },
    ],
    // Semaine 7 — Communication assertive
    [
      { title: 'Exprimer vos besoins dans une situation difficile', description: 'Choisissez une situation récurrente stressante et exprimez vos besoins clairement en utilisant la formule "Je ressens... J\'ai besoin de...".', duration: 'Variable', category: 'communication' },
      { title: 'Moment de qualité avec un proche', description: 'Planifiez 2h avec quelqu\'un qui vous nourrit. Pas de travail en sujet. Soyez pleinement présent(e).', duration: '2 heures', category: 'social' },
      { title: 'Lettre de bienveillance à vous-même', description: 'Écrivez une lettre à votre "vous épuisé" avec la bienveillance que vous auriez pour un ami cher. Ne l\'envoyez pas.', duration: '20 min', category: 'autocompassion' },
    ],
    // Semaine 8 — Système de résilience
    [
      { title: 'Définir votre politique personnelle d\'urgences', description: 'Qu\'est-ce qui justifie vraiment une réponse immédiate hors des heures de travail ? Répondez par écrit. Partagez avec votre équipe.', duration: '30 min', category: 'limites' },
      { title: 'Cartographier vos ressources de soutien', description: 'Listez 5 ressources accessibles en cas de surcharge : 2 personnes, 1 lieu, 1 pratique, 1 service professionnel.', duration: '20 min', category: 'prévention' },
      { title: 'Bilan des 8 semaines', description: 'Qu\'est-ce qui a le plus aidé ? Qu\'allez-vous garder ? Qu\'allez-vous abandonner ? Notez vos 3 engagements pour les 3 prochains mois.', duration: '30 min', category: 'bilan' },
    ],
  ],

  medium: [
    // Semaine 1 — Conscience de soi
    [
      { title: 'Journal d\'énergie : noter son niveau 3×/jour', description: 'Matin, midi, soir : notez votre niveau d\'énergie de 1 à 10. Après une semaine, identifiez vos patterns.', duration: '2 min × 3', category: 'conscience' },
      { title: 'Identifier vos 3 principales sources de stress', description: 'Prenez 20 min pour lister tout ce qui vous pèse au travail. Organisez par catégorie. Vous ne pouvez pas résoudre ce que vous ne voyez pas.', duration: '20 min', category: 'analyse' },
      { title: 'Lister vos forces professionnelles', description: 'Notez 5 compétences ou qualités que vous apportez au travail. Relisez cette liste quand le doute s\'installe.', duration: '15 min', category: 'estime' },
    ],
    // Semaine 2 — Micro-pauses et respiration
    [
      { title: 'Respiration 4-7-8 avant chaque réunion', description: 'Inspirez 4 sec, retenez 7 sec, expirez 8 sec. Répétez 3 fois. Régule le système nerveux autonome en 90 secondes.', duration: '2 min', category: 'respiration' },
      { title: '3 pauses programmées dans la journée', description: 'Programmez 3 alarmes à intervalles réguliers. Lors de chaque pause : levez-vous, buvez de l\'eau, regardez par la fenêtre.', duration: '5 min × 3', category: 'récupération' },
      { title: 'Marche de 15 min après le déjeuner', description: 'Sortez marcher après le déjeuner. Laissez votre téléphone au bureau. Profitez de la digestion pour décompresser.', duration: '15 min/jour', category: 'mouvement' },
    ],
    // Semaine 3 — Journaling
    [
      { title: '3 points positifs chaque soir', description: 'Avant de dormir, notez 3 choses positives vécues dans la journée (aussi petites soient-elles). Recâble le cerveau vers le positif.', duration: '5 min/soir', category: 'gratitude' },
      { title: 'Analyse d\'une situation stressante', description: 'Choisissez une situation difficile récente. Écrivez : ce qui s\'est passé, ce que vous avez ressenti, ce qui était en votre pouvoir.', duration: '15 min', category: 'réflexion' },
      { title: 'Clarifier vos 3 valeurs professionnelles', description: 'Qu\'est-ce qui donne du sens à votre travail ? Quand vous les avez, vérifiez si votre quotidien leur est aligné.', duration: '20 min', category: 'valeurs' },
    ],
    // Semaine 4 — Exercice et mouvement
    [
      { title: 'Sport 30 min × 4 cette semaine', description: 'Choisissez une activité que vous aimez. Marche rapide, yoga, vélo, danse... La régularité prime sur l\'intensité.', duration: '30 min × 4', category: 'mouvement' },
      { title: 'Étirements en milieu de journée', description: 'À 11h et 15h, faites 5 min d\'étirements du cou, épaules, dos. La posture assise prolongée crée une tension physique qui aggrave le stress.', duration: '5 min × 2', category: 'corps' },
      { title: 'Supprimer l\'ascenseur pendant une semaine', description: 'Prenez les escaliers systématiquement. Simple, mais les petits gestes de mouvement s\'accumulent.', duration: 'Quotidien', category: 'mouvement doux' },
    ],
    // Semaine 5 — Gestion du temps
    [
      { title: 'Technique Pomodoro : 2h par jour', description: '25 min de focus total, 5 min de pause. Répétez. Désactivez toutes les notifications pendant les sprints. Notez l\'effet sur votre productivité.', duration: '2h/jour', category: 'focus' },
      { title: 'Identifier 3 voleurs de temps récurrents', description: 'Réunions inutiles ? Emails constants ? Interruptions ? Identifiez vos 3 pires habitudes et définissez une règle pour chacune.', duration: '20 min', category: 'organisation' },
      { title: 'Distinguer urgent et important (Eisenhower)', description: 'Divisez votre to-do en 4 quadrants. Travaillez d\'abord sur "important non-urgent". C\'est là que se construit la prévention.', duration: '30 min', category: 'priorisation' },
    ],
    // Semaine 6 — Relations professionnelles saines
    [
      { title: 'Exprimer de la reconnaissance à un collègue', description: 'Remerciez sincèrement un collègue pour quelque chose de spécifique. La reconnaissance nourrit les deux parties.', duration: '5 min', category: 'social' },
      { title: 'Rituel de déconnexion pro/perso', description: 'Créez un geste symbolique de fin de journée (rangement, playlist, trajet) qui signale à votre cerveau que le travail est terminé.', duration: 'Variable', category: 'limites' },
      { title: 'Demander du feedback sur un projet', description: 'Sollicitez un retour constructif sur un travail en cours. Le feedback renforce le sentiment d\'efficacité et d\'appartenance.', duration: '20 min', category: 'communication' },
    ],
    // Semaine 7 — Loisirs et ressourcement
    [
      { title: '2h d\'activité créative ou de passion', description: 'Dessin, musique, jardinage, cuisine, sport... Une activité qui vous absorbe complètement et où vous perdez la notion du temps.', duration: '2 heures', category: 'créativité' },
      { title: 'Une soirée sans parler de travail', description: 'Convenez avec votre entourage de passer une soirée entière sans évoquer le travail. Observez ce que vous avez à dire autrement.', duration: '1 soirée', category: 'déconnexion' },
      { title: 'Planifier des vacances ou une sortie', description: 'Bloquez une date dans les 30 prochains jours pour quelque chose qui vous fait vraiment plaisir. Le simple fait de planifier réduit le stress.', duration: '15 min de planning', category: 'plaisir' },
    ],
    // Semaine 8 — Consolidation
    [
      { title: 'Bilan des 3 habitudes les plus bénéfiques', description: 'Parmi tout ce que vous avez essayé, identifiez les 3 pratiques qui vous ont fait le plus de bien. Ce sont vos piliers personnels.', duration: '20 min', category: 'bilan' },
      { title: 'Créer votre plan de bien-être personnel', description: 'Rédigez un plan : 3 habitudes quotidiennes, 2 hebdomadaires, 1 mensuelle. Partagez-le avec quelqu\'un pour ancrer l\'engagement.', duration: '45 min', category: 'prévention' },
      { title: 'Transmettre à quelqu\'un qui en a besoin', description: 'Partagez une pratique utile avec un collègue ou proche qui semble sous tension. Transmettre renforce l\'apprentissage.', duration: '30 min', category: 'transmission' },
    ],
  ],

  low: [
    // Semaine 1 — Ancrage et gratitude
    [
      { title: 'Journal de gratitude chaque matin', description: 'Écrivez 3 choses pour lesquelles vous êtes reconnaissant(e) avant de commencer la journée. Entraîne l\'attention sur le positif.', duration: '5 min/matin', category: 'gratitude' },
      { title: 'Carnet de victoires hebdomadaire', description: 'Chaque vendredi, notez 3 réussites de la semaine, petites ou grandes. Constitue une banque de preuves de compétence.', duration: '10 min/semaine', category: 'estime' },
      { title: 'Repas ou moment de qualité avec des proches', description: 'Planifiez un moment de connexion authentique avec des personnes qui vous nourrissent. La qualité des liens protège du burnout.', duration: '1–2 heures', category: 'social' },
    ],
    // Semaine 2 — Approfondissement de la pleine conscience
    [
      { title: 'Méditation guidée 10 min chaque matin', description: 'Utilisez une app (Petit Bambou, Calm, Headspace). Commencez par les programmes débutant. La régularité prime sur la durée.', duration: '10 min/matin', category: 'mindfulness' },
      { title: 'Activité quotidienne en pleine conscience', description: 'Choisissez une activité (marche, repas) et faites-la sans téléphone, en portant toute votre attention au moment présent.', duration: '30 min/jour', category: 'présence' },
      { title: 'Respiration consciente 3×/jour', description: 'À heures fixes, prenez 2 min pour 6 respirations lentes et profondes. Une pause de régulation qui s\'intègre à n\'importe quelle journée.', duration: '2 min × 3', category: 'respiration' },
    ],
    // Semaine 3 — Développement personnel
    [
      { title: 'Lire 20 min chaque jour sur un sujet passion', description: 'Un livre, un article, un podcast sur quelque chose qui vous fascine hors du travail. Nourrit la curiosité et l\'identité hors travail.', duration: '20 min/jour', category: 'apprentissage' },
      { title: 'Commencer une formation sur une compétence souhaitée', description: 'Identifiez une compétence que vous voulez développer (hors travail si possible). Commencez un tutoriel ou un cours en ligne.', duration: '1 heure', category: 'croissance' },
      { title: 'Contacter un mentor ou une inspiration', description: 'Identifiez quelqu\'un que vous admirez et envoyez-lui un message sincère. Les connexions nourrissantes protègent la santé mentale.', duration: '30 min', category: 'réseau' },
    ],
    // Semaine 4 — Renforcement des liens sociaux
    [
      { title: 'Retrouver un ami ou proche perdu de vue', description: 'Envoyez un message à quelqu\'un que vous n\'avez pas vu depuis longtemps et proposez de vous retrouver. Les liens forts sont un rempart.', duration: '1–2 heures', category: 'lien' },
      { title: 'Messages de reconnaissance à 3 personnes', description: 'Écrivez à 3 personnes qui comptent pour vous un message sincère et spécifique. La gratitude exprimée renforce les deux parties.', duration: '15 min', category: 'gratitude' },
      { title: 'Activité de groupe (sport, art, bénévolat)', description: 'Rejoignez une activité collective que vous n\'avez pas essayée. Le sentiment d\'appartenance est un facteur protecteur majeur.', duration: '1–2 heures', category: 'communauté' },
    ],
    // Semaine 5 — Expression créative
    [
      { title: '1h d\'activité créative pure', description: 'Dessin, musique, écriture, photographie, cuisine créative... Choisissez quelque chose sans objectif de résultat. Juste le plaisir du processus.', duration: '1 heure', category: 'créativité' },
      { title: 'Essayer quelque chose de nouveau', description: 'Choisissez une expérience que vous n\'avez jamais faite (cuisine d\'un autre pays, sport, visite...). La nouveauté stimule la vitalité.', duration: 'Variable', category: 'nouveauté' },
      { title: 'Partager une création avec quelqu\'un', description: 'Montrez ou partagez quelque chose que vous avez fait, appris ou créé. L\'expression authentique renforce la confiance en soi.', duration: '30 min', category: 'partage' },
    ],
    // Semaine 6 — Impact positif
    [
      { title: 'Action bénévole ou de service', description: 'Consacrez quelques heures à aider quelqu\'un ou une association. Donner sans attente de retour est l\'une des sources de sens les plus puissantes.', duration: '1–2 heures', category: 'altruisme' },
      { title: 'Transmettre un savoir à un collègue junior', description: 'Proposez à un collègue moins expérimenté de partager une compétence ou une expérience. Enseigner consolide et donne du sens.', duration: '30 min', category: 'mentorat' },
      { title: 'Améliorer un processus de travail', description: 'Identifiez un point de friction dans votre équipe et proposez une amélioration concrète. Contribuer activement renforce l\'engagement.', duration: '1 heure', category: 'contribution' },
    ],
    // Semaine 7 — Préparation à la résilience
    [
      { title: 'Évaluer vos 5 piliers de bien-être', description: 'Notez de 1 à 10 : sommeil, nutrition, exercice, relations, sens au travail. Quel est le pilier le plus fragile ? Qu\'allez-vous faire ?', duration: '30 min', category: 'bilan' },
      { title: 'Plan pour les périodes de forte charge', description: 'Anticipez : la prochaine période chargée arrive. Quelles habitudes garderez-vous absolument ? Que couperez-vous temporairement ?', duration: '30 min', category: 'anticipation' },
      { title: 'Technique de récupération rapide pour les mauvaises journées', description: 'Définissez un protocole personnel (15 min de marche + musique + un thé) à activer les jours difficiles. Automatiser protège.', duration: '15 min (à définir)', category: 'résilience' },
    ],
    // Semaine 8 — Excellence durable
    [
      { title: 'Rédiger votre manifeste personnel', description: 'Écrivez une page sur : vos valeurs fondamentales, vos limites non-négociables, vos sources de joie. Ce texte est votre boussole.', duration: '1 heure', category: 'identité' },
      { title: 'Programmer votre prochain diagnostic dans 3 mois', description: 'Bloquez une date pour refaire l\'évaluation CBI. Maintenir la vigilance est la meilleure prévention du burnout.', duration: '5 min', category: 'suivi' },
      { title: 'Célébrer vos 8 semaines', description: 'Vous avez investi en vous-même pendant 2 mois. Célébrez sincèrement : faites quelque chose qui vous réjouit vraiment.', duration: 'Variable', category: 'célébration' },
    ],
  ],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { assessment_id, user_id } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', assessment_id)
      .single();

    if (assessmentError) throw assessmentError;

    const weekTemplates = PLAN_TEMPLATES[assessment.risk_level] ?? PLAN_TEMPLATES.medium;

    // Generate 24 actions (3 per week × 8 weeks) with relative week numbers 1–8
    const actions = weekTemplates.flatMap((weekActions, weekIndex) =>
      weekActions.map((template, actionIndex) => ({
        id: `${assessment_id}-w${weekIndex + 1}-${actionIndex + 1}`,
        ...template,
        week: weekIndex + 1,
      }))
    );

    const { data: plan, error: planError } = await supabase
      .from('action_plans')
      .insert({
        user_id,
        assessment_id,
        week_number: 1,
        actions,
        completed_actions: [],
      })
      .select()
      .single();

    if (planError) throw planError;

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
