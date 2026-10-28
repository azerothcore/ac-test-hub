/**
 * PR descriptions modelled on the shapes seen in azerothcore-wotlk (October 2026):
 * the current template, an untouched template, free-form descriptions.
 * The prose is invented; the template lines are AzerothCore's.
 */

const FOOTER = `## How to Test AzerothCore PRs

When a PR is ready to be tested, it will be marked as **[WAITING TO BE TESTED]**.

You can help by testing PRs and writing your feedback here on the PR's page on GitHub. Follow the instructions here:

http://www.azerothcore.org/wiki/How-to-test-a-PR
`;

/** Filled-in template, Windows line endings, uppercase [X], template hints left in. */
export const filledTemplate = `<!-- First of all, THANK YOU for your contribution. -->

## Changes Proposed:
<!-- If your pull request promotes complex changes that require a detailed explanation, please describe them. -->
This PR proposes changes to:
-  [ ] Core (units, players, creatures, game systems).
-  [X] Scripts (bosses, spell scripts, creature scripts).
-  [ ] Database (SAI, creatures, etc).

### AI-assisted Pull Requests

- [ ] AI tools (e.g. Claude, ChatGPT, or similar) were used entirely or partially to prepare this pull request.

## Issues Addressed:
<!-- If your fix has a relating issue, link it below -->
- Closes #12345
- Closes https://github.com/azerothcore/azerothcore-wotlk/issues/12346

## SOURCE:
The changes have been validated through:
- [x] Video evidence, knowledge databases or other public sources (e.g forums, Wowhead, etc.)

## Tests Performed:
This PR has been:
- [X] Tested in-game by the author.
- [ ] Tested in-game by other community members/someone else other than the author/has been live on production servers.
- [X] This pull request requires further testing and may have edge cases to be tested.

## How to Test the Changes:
<!-- Describe in a detailed step-by-step order how to test the changes -->

- [ ] This pull request can be tested by following the reproduction steps provided in the linked issue
- [X] This pull request requires further testing. Provide steps to test your changes. If it requires any specific setup e.g multiple players please specify it as well.

1. \`.go creature 12345\` and pull the boss.
2. Check that the adds spawn at 50% health.
3. Wipe and pull again: the adds must not stay in combat.

## Known Issues and TODO List:

- [ ]
- [ ]

${FOOTER}`.replace(/\n/g, '\r\n');

/** Template submitted as is. */
export const untouchedTemplate = `## Changes Proposed:
This PR proposes changes to:
-  [ ] Core (units, players, creatures, game systems).
-  [ ] Scripts (bosses, spell scripts, creature scripts).
-  [ ] Database (SAI, creatures, etc).

## Issues Addressed:
- Closes

## Tests Performed:
This PR has been:
- [ ] Tested in-game by the author.
- [ ] Tested in-game by other community members/someone else other than the author/has been live on production servers.
- [ ] This pull request requires further testing and may have edge cases to be tested.

## How to Test the Changes:

- [ ] This pull request can be tested by following the reproduction steps provided in the linked issue
- [ ] This pull request requires further testing. Provide steps to test your changes. If it requires any specific setup e.g multiple players please specify it as well.

1.
2.
3.

${FOOTER}`;

/** Steps are in the linked issue, nothing else under the heading. */
export const reproInIssue = `## Issues Addressed:
- Part of #13937
- Refs #4091

## How to Test the Changes:

- [x] This pull request can be tested by following the reproduction steps provided in the linked issue
- [ ] This pull request requires further testing. Provide steps to test your changes.

${FOOTER}`;

/** Free-form description without the template. */
export const freeForm = `## Changes proposed

Fix the trapped crates so that opening one triggers its trap. See azerothcore#999 for history.

## Issue

Closes #2222

## In-game checks still required

1. Open each trapped crate from outside its trigger radius.
2. Walk into a fresh crate: the trap fires once.
`;

/** Template where the author removed the "How to Test the Changes" section. */
export const noTestSection = `## Changes Proposed:
Makes the hydra close to melee when silenced.

## Tests Performed:

Verified in game before and after the change.

${FOOTER}`;
