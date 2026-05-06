Test technique
Ingénieur(e) IA Full-Stack
Sujet
Une PME française nous fournit un fichier décrivant son entreprise (secteur, valeurs, ton de
marque, cibles) et nous demande de générer, à la demande, des publications LinkedIn
cohérentes avec son identité, accompagnées d'une note d'intention expliquant les choix
éditoriaux retenus.
Vous concevez et livrez un mini-service web qui prend en entrée la description de l'entreprise et
un brief court (par exemple « annonce de recrutement » ou « retour d'expérience client »), et
restitue en sortie une publication LinkedIn rédigée et une note d'intention de quelques lignes.
Attendus
Service en ligne
• Application web déployée sur une URL publique, comportant : un champ description
d'entreprise (jusqu'à 2 000 caractères), un champ brief (jusqu'à 500 caractères), un
sélecteur de ton, un bouton de génération.
• Restitution affichant la publication LinkedIn (1 300 caractères maximum) et la note
d'intention, avec un bouton de copie.
• Appel au modèle de langage orchestré côté serveur (la clé API ne doit pas être exposée
côté client) et mécanisme simple de mise en cache.
• Gestion propre des cas d'erreur (entrée vide, modèle indisponible).
Code source
• Dépôt Git public (GitHub, GitLab) avec un README documentant les choix techniques, les
modalités de lancement local et les limites identifiées.
Restitution
• Document PDF court (deux à quatre pages) destiné à un lecteur non technique, expliquant
ce que fait le service, comment il fonctionne dans les grandes lignes, ses limites et les
pistes d'industrialisation à six mois.
Liberté technique
Vous êtes libre du framework, du fournisseur de modèle, de la stratégie de prompt et de
l'hébergement. Privilégiez la qualité d'exécution à la quantité de fonctionnalités. Un service
simple, robuste, bien documenté et bien présenté sera mieux noté qu'un service ambitieux
mais inachevé.
Modalités
• Délai : sept jours calendaires à compter de la réception du sujet.
• Charge estimée : dix à quinze heures de travail effectif.
• Rendu : courrier électronique unique à recrutement@impalia.com (URL du service, URL
du dépôt, PDF)
• Soutenance : si votre rendu est retenu, vous serez convié(e) à un entretien d'une heure
trente (présentation, discussion technique avec notre conseil externe, échange ouvert).
• Questions : à adresser à recrutement@impalia.com, réponse sous quarante-huit heures
ouvrées.
Critères d'évaluation
Dimension évaluée Pondération Évaluateur principal
Qualité fonctionnelle du service livré 30 % Direction Impalia
Qualité du code et choix d'architecture 30 % Conseil technique externe
Clarté de la restitution écrite et orale 25 % Direction Impalia
Pertinence du prompt engineering et de la
stratégie IA

15 % Conseil technique externe

Confidentialité
Le présent énoncé est confidentiel et les éventuelles données d'entreprise communiquées sont
fictives. Vous êtes autorisé(e) à conserver votre travail à titre de référence personnelle, mais à
ne pas diffuser publiquement le sujet.