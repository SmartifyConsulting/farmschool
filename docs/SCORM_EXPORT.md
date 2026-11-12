# Native SCORM export

Course Studio course actions can create a single-SCO SCORM 1.2 ZIP with the
manifest at its root. Native reading/video lessons, text-rendered slide content,
and fixed choice, boolean, fill-in and matching quizzes are supported. Video
URLs must use HTTPS and still require internet and destination access. Text
slide export preserves teaching content but flattens interactive widgets.

The standalone player finds the parent/opener LMS API, initializes it, saves
bookmarks and compact completion/quiz state, reports scores and completion, and
finishes its communication session on exit. It does not claim a successful save
when the LMS refuses a value or commit. Content uses text nodes rather than
injecting author HTML. Quiz answer keys are necessarily part of the downloaded
package; only the source course owner can request that export.

Export refuses nested SCORM, trainer-approved photo tasks, hotspot images,
AI-written grading, sampled quiz pools and supplementary library links that
cannot yet be packaged faithfully. Reconnect library videos as native lesson
video URLs where appropriate. Unsupported content is not silently omitted.

Purchases, licences, prerequisites, deadlines, moderation, quotas, organisational
policies and Plusticity certificates stay in Plusticity. The destination LMS
manages its own learner access and awards. This exporter does not claim SCORM
2004 export or complete SCORM conformance. Original uploaded SCORM ZIPs are not
embedded or re-exported by this native-content exporter.

Primary protocol references reviewed include the ADL SCORM 1.2 Content Cookbook
(https://scorm.com/wp-content/assets/cookbook/CookingUpASCORM_v1_2.pdf) and ADL's
SCORM/xAPI profile (https://github.com/adlnet/xAPI-SCORM-Profile/blob/master/xapi-scorm-profile-old.md).

Automated checks parse the ZIP and XML, inspect script-safe payload handling,
exercise LMS connection/commit failure, completion/resume/finish, and grade all
supported question formats with a simulated API/DOM. The application suite
passes 253 tests with 17 environment-gated skips. TypeScript and production build
pass. Import, launch, resume and reporting in a real destination LMS remain
unverified and are required before assigning exported packages to learners.
