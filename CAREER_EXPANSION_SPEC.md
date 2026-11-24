# FINAL FURLONG — COMPLETE CAREER MODE & 3D STABLE EMPIRE EXPANSION

A WALKABLE AUSTRALIAN THOROUGHBRED TRAINING PROPERTY · LONG-TERM HORSE DEVELOPMENT · FINANCES · FACILITY UPGRADES · HORSE AUCTIONS · STAFF · FULL RACING CALENDAR · DYNAMIC RACE TIMES

> Master design document supplied by the project owner (saved verbatim). The implementation plan is in
> `CAREER_PLAN.md` and the running status in `CAREER_PROGRESS.md`.
>
> **Standing instructions that accompanied this specification**
> - Treat this as the master design document for the entire project. Refer to it rather than asking for it again.
> - Implement phase by phase: only the approved phase at a time; after each phase run appropriate tests, check that
>   existing racing functionality remains intact, and create a Git commit.
> - Maintain `CAREER_PROGRESS.md`: what is complete, what remains, any bugs, and exactly what the next phase requires.
> - Temporarily hide and disable multiplayer in the game, but preserve its source code for future restoration. Do not
>   work on multiplayer during this expansion.
> - Prioritise preserving existing gameplay, graphics, commentary and save data. Do not sacrifice racing smoothness to
>   add the farm environment.
> - When a phase is finished, provide a playable version for review before proceeding to major visual or gameplay
>   changes in the next phase.

---

## 1. YOUR MISSION

You are an expert Three.js game developer, gameplay architect, 3D environment artist, horse racing simulation developer, career progression designer, game economy designer and performance optimisation engineer.

Continue development directly from the latest working version of Final Furlong already available in this project.

Do not ask me to upload it again.

Do not restart the game.

Do not use an older version of the code.

The current version already has substantial racing gameplay, detailed horse and jockey models, Royal Randwick and Flemington environments, a stable, horse customisation, career progression, championships, commentary and racing physics.

These systems should be preserved and extended.

Your task is to transform Career Mode into a substantial Australian thoroughbred stable-management and racing experience, while keeping the actual horse racing as the centre of the game.

I want the player to feel as though they own and operate a real Australian racing stable.

They should be able to:

* Control a customisable 3D character.
* Walk around a medium-sized farm-style property.
* Visit their horses in individual stables.
* Interact with and look after their horses.
* Walk to training facilities.
* Participate in optional hands-on training.
* Walk to their farmhouse and manage the racing calendar.
* Buy and develop horses.
* Hire staff.
* Earn prize money.
* Pay realistic but manageable stable expenses.
* Upgrade facilities.
* Develop horses across many racing seasons.
* Enter local and major Australian races.
* Retire successful horses.
* Build an elite stable with a meaningful racing legacy.

The farm environment and racing environments must be separate scenes for performance.

Do not load the entire farm while the player is racing.

Do not spend development time on online racing.

The immediate focus is making the best possible single-player Career Mode.

This must be a working implementation, not simply a concept, mock-up or written design.

## 2. THE OVERALL CAREER EXPERIENCE

Final Furlong should now have two major connected gameplay experiences.

### Experience A — The Stable

A detailed but efficiently rendered Australian training property.

The player walks around in third person.

They interact with:

* Horses.
* Stable stalls.
* Training facilities.
* Grooming stations.
* Farmhouse office.
* Staff.
* Paddocks.
* Horse transport area.
* Facility upgrade locations.

This is where long-term management takes place.

### Experience B — Racing

The existing detailed racing simulation.

When entering an event, the game loads the appropriate racecourse.

The player competes using the existing riding controls and physics.

Race results influence:

* Prize money.
* Horse experience.
* Horse fitness.
* Career records.
* Horse form.
* Reputation.
* Rivalries.
* Championship progress.
* Qualifications.

When the race finishes, the player returns to the farm.

Both experiences must be connected by persistent career data, but should not share unnecessary active rendering resources.

## 3. PRESERVE EVERYTHING THAT ALREADY WORKS

Before implementing anything, inspect the existing Career Mode, stable, horse creator, training, progression and race systems.

The current game already contains important functionality.

Do not accidentally replace these systems with simpler versions.

Preserve:

* Quick Race.
* Career Mode.
* Championship Mode.
* Existing racing calendar information where compatible.
* Royal Randwick.
* Flemington.
* The Everest.
* Melbourne Cup.
* Current race physics.
* Horse acceleration and stamina.
* Horse effort controls.
* Settling.
* Checking.
* Urging.
* Driving.
* Track-relative steering.
* Sprint rhythm.
* Starting-gate mechanics.
* Pack racing and AI tactics.
* Horse collisions.
* Horse falls.
* Chaos Mode where appropriate.
* All current horse models.
* All current jockey models.
* Horse appearance customisation.
* Jockey silks.
* Improved camera systems.
* Commentary and its current configured voice options.
* Official race results.
* Photo-finish replay.
* Persistent AI rivals.
* Horse records.
* Championship progress.
* Trophy records.
* Existing career saves.

If improved starting mechanics, horse responsiveness or tactical AI have already been implemented in the current version, preserve those improvements.

Do not reintroduce old bugs.

In particular:

* A must steer towards the inside rail.
* D must steer towards the outside rail.
* Races must remain reasonably smooth.
* Crowd placement must remain correct.
* The repaired Flemington grandstand must remain intact.
* Commentary must not block racing.
* Career saves must not disappear.

## 4. BUILD A WALKABLE 3D AUSTRALIAN FARM

This is the biggest new visual component.

Create a medium-sized Australian thoroughbred training property.

The property should feel substantial enough to explore, but not unnecessarily huge.

I do not want a massive open-world game.

I want a compact, believable property containing the main areas needed to run a professional but relatively small stable.

### 4.1 General layout

Include:

1. Farmhouse and career office.
2. Main stable block containing five individual horse stalls.
3. Stable courtyard and walkways.
4. Grooming and wash bay.
5. Feed and equipment storage.
6. Training area.
7. Small training track or exercise lane.
8. Horse paddocks.
9. Veterinary or care area.
10. Horse transport and race departure area.
11. Space for modest visible facility improvements.

The layout should be logical.

The stable block should be near the main courtyard.

The farmhouse should be within reasonable walking distance.

The training area should be accessible without travelling across a huge empty property.

The paddocks should feel connected to the stable.

### 4.2 Australian farm atmosphere

Use visual references appropriate to an Australian thoroughbred training property.

Include:

* Natural grass.
* Timber and metal stable structures.
* Concrete or gravel walkways.
* Timber fencing.
* Paddock gates.
* Suitable trees.
* Feed storage.
* Water troughs.
* Training equipment.
* A modest farmhouse.
* Natural sunlight.
* A realistic rural atmosphere.

Avoid making it look like a medieval village, luxury European mansion or fantasy horse farm.

The property should feel like a credible Australian racing operation.

### 4.3 Visual quality

Preserve the improved visual style of the current game.

Use:

* Realistic proportions.
* Convincing materials.
* Detailed nearby objects.
* Natural lighting.
* Good shadows.
* High-quality horses.

However, use efficient 3D construction.

Do not create thousands of unnecessary individual meshes.

The farm must run smoothly.

## 5. THIRD-PERSON PLAYER CHARACTER

Create a controllable 3D human character.

The character represents the owner and trainer of the stable.

### 5.1 Controls

In the farm environment, use intuitive third-person controls.

Suggested:

* W — Walk forward.
* S — Walk backward.
* A — Move left.
* D — Move right.
* Mouse — Rotate camera.
* Shift — Jog.
* E — Interact.
* Esc — Pause/menu.

These are farm exploration controls only.

Do not change the existing horse-racing controls.

The farm and race scenes should use separate input contexts so that their controls do not interfere.

### 5.2 Movement

The character should:

* Walk naturally.
* Jog when requested.
* Turn smoothly.
* Stop realistically.
* Follow terrain height.
* Avoid walking through buildings.
* Avoid walking through horses.
* Interact with nearby objects.

Use appropriate collision detection.

Avoid excessively complex character physics where a simpler reliable controller will work.

### 5.3 Third-person camera

Position the camera slightly behind and above the player.

Provide:

* Smooth following.
* Mouse-controlled rotation.
* Sensible collision avoidance.
* Adjustable sensitivity.
* A useful viewing angle.
* Enough visibility to explore the property.

Avoid excessive camera shake.

### 5.4 Character appearance

Allow the player to customise:

* Face or head appearance.
* Hair.
* Skin tone.
* Basic body proportions.
* Shirt or jacket.
* Trousers.
* Boots.
* Riding helmet.
* Riding equipment.

Offer a practical range of customisation.

The character should look believable without requiring an extremely expensive character creator.

### 5.5 Outfits

Include at least:

* Casual stable outfit.
* Training/riding outfit.
* Race-day outfit.

Save the selected appearance.

Do not create hundreds of cosmetic items during this update.

## 6. MAKE THE FARM INTERACTIVE

The property should not merely be a 3D background around traditional menus.

The player should interact with the environment.

### 6.1 Interaction system

When approaching an interactable object, show a small context prompt.

Examples:

* E — Inspect Horse.
* E — Groom Horse.
* E — Open Stable Office.
* E — Begin Training.
* E — View Facilities.
* E — Manage Staff.
* E — Enter Next Race.

Use a reliable interaction distance.

Highlight interactable areas subtly.

Do not allow interactions through walls.

### 6.2 Avoid tedious navigation

Although walking is central to the experience, provide optional shortcuts.

The player should be able to open a simple farm map or quick-access menu to reach major activities.

Do not make someone walk across the property every time they want to check a race date.

### 6.3 Natural horse behaviour

Horses should not stand perfectly motionless.

Add subtle idle behaviours such as:

* Looking around.
* Moving ears.
* Shifting weight.
* Breathing.
* Moving their tails.
* Lowering their heads.
* Eating.
* Resting.

These should be lightweight animations.

Do not run complex animation systems for horses that are not visible.

## 7. INDIVIDUAL HORSE STALLS

Preserve the five-horse maximum.

Create five individual stables or stalls within the stable block.

Each occupied stall should display the correct saved horse.

### 7.1 Horse identity

Show:

* Horse name.
* Age.
* Basic condition.
* Current form.
* Next scheduled race where relevant.

Use stable signs or plaques.

### 7.2 Visual consistency

The horse shown in the stable must be the same horse that appears in races.

Preserve:

* Coat.
* Markings.
* Build.
* Mane.
* Tail.
* Other custom appearance information.

Do not generate a generic substitute horse.

### 7.3 Empty stalls

Empty stalls should visibly remain available.

Allow the player to assign new horses to vacant stalls.

### 7.4 Horse interactions

Allow the player to:

* Approach the horse.
* Inspect it.
* Groom it.
* Feed it.
* Check its condition.
* Prepare it for training.
* View its career records.
* Access its training schedule.
* Lead it to an activity.

Keep these interactions immersive without making them unnecessarily complicated.

## 8. GROOMING, FEEDING AND HORSE CARE

I want horses to feel like animals the player owns and looks after.

However, I do not want repetitive chores to dominate the game.

### 8.1 Grooming

Create a short optional grooming interaction.

The player approaches a horse and selects grooming.

Possible actions:

* Brush the coat.
* Clean the horse.
* Inspect its condition.
* Prepare it for a race.

Use simple, satisfying animations.

Grooming may provide a small temporary improvement to care or readiness.

It should not permanently increase top speed.

### 8.2 Feeding

Allow appropriate feeding choices.

For example:

* Standard stable feed.
* Improved quality feed.
* Specialist feeding programme.

Keep nutritional mechanics simple.

Do not require detailed real-world feed calculations.

Higher-quality feeding may improve condition consistency, subject to a balanced financial cost.

### 8.3 Horse happiness and composure

Introduce a lightweight welfare/composure system if useful.

A well-managed horse should be more consistent.

Avoid turning this into an exhausting survival system with multiple constantly declining meters.

### 8.4 Staff automation

Routine feeding, grooming and care should be handled automatically when the player has suitable staff.

Manual care should provide enjoyment and small rewards, not be mandatory for every horse every day.

## 9. HANDS-ON HORSE TRAINING

The training area should be a meaningful part of the new stable world.

The player should be able to walk to it and choose training activities.

### 9.1 Training categories

Connect training to the current horse attributes.

Examples:

* Acceleration training.
* Top-speed training.
* Endurance training.
* Sprint-power training.
* Recovery training.
* Temperament and settling.
* Agility and balance.
* Starting-gate practice.

Use the existing attribute structure rather than creating a contradictory second set of statistics.

### 9.2 Training activities

Offer a mixture of:

**Scheduled training**

Choose an activity and advance career time.

**Hands-on training**

Participate in a short playable activity.

For example:

**Acceleration drill**

Ride the horse over a short distance and aim for smooth acceleration.

**Endurance drill**

Maintain a controlled effort across a longer training section.

**Starting-gate practice**

Rehearse the game's actual gate-start mechanics.

**Settling drill**

Maintain controlled pace and rhythm.

**Sprint-rhythm drill**

Practise the final-drive timing system.

These should reuse existing riding mechanics wherever possible.

### 9.3 Balance manual and automatic training

Hands-on training should provide a modest efficiency bonus or better feedback.

It must not be so powerful that players feel forced to repeat the same minigame every day.

Scheduled training must remain viable.

### 9.4 Prevent training exploits

Do not allow unlimited training on the same career day.

Use appropriate training limits and diminishing returns.

Do not allow the player to repeatedly enter and exit an activity to gain free attributes.

### 9.5 Training visualisation

The training area should have visible equipment and facilities.

However, keep the environment relatively compact.

Do not build a second full-sized Randwick or Flemington just for training.

## 10. MUCH LONGER HORSE DEVELOPMENT

The current horse progression system is too short for the expanded career experience.

I want individual horses to develop over many seasons.

Some horses should be capable of racing for eight or more seasons, with appropriate ageing.

### 10.1 Three separate aspects of development

Distinguish:

**Permanent ability**

Long-term racing attributes.

These improve slowly through training and racing.

**Current fitness and form**

Shorter-term condition.

These change through training, recovery and recent racing.

**Age and experience**

The horse's stage of development, maturity and accumulated racing experience.

These systems must not be confused.

### 10.2 Young horses

Younger horses may:

* Have lower starting ratings.
* Improve more rapidly.
* Be less experienced in traffic.
* Be less consistent.
* Have meaningful long-term potential.

### 10.3 Developing horses

As a horse races and trains, it should:

* Build its abilities.
* Become more consistent.
* Improve composure.
* Approach its individual potential.
* Establish a preferred distance and running style.

### 10.4 Mature horses

Many horses should reach their peak after several seasons.

Peak years should feel rewarding.

A horse that was ordinary early in its career might eventually become an elite competitor.

### 10.5 Older horses

Older horses may:

* Improve more slowly.
* Gradually lose some physical ability.
* Retain experience.
* Maintain tactical consistency.
* Become less competitive at the highest level.

Decline should not be abrupt or identical for every horse.

### 10.6 Exceptional longevity

Some horses should remain competitive for eight or more seasons.

Others may retire earlier.

Use sensible variation.

### 10.7 No pointless grind

A longer career must not simply mean dividing current XP rewards by ten.

Add meaningful progression stages, race grades, financial decisions, performance milestones and horse-development choices.

The early game must still be enjoyable.

The player should notice improvements over weeks and months, even though reaching elite potential takes seasons.

## 11. HORSE POTENTIAL AND DEVELOPMENT

Preserve the existing player-controlled starting attributes and potential allocation system.

Do not randomly overwrite a horse's potential.

### 11.1 Potential ceilings

Each horse should have defined long-term potential.

Training cannot permanently push attributes beyond the intended limits unless an explicitly designed and balanced system permits rare minor changes.

### 11.2 Growth rates

Different horses may develop at different speeds.

For example:

* Early developers.
* Average developers.
* Late-maturing horses.

Avoid making all horses follow identical progression curves.

### 11.3 Training specialisation

A player may choose to focus on certain strengths.

For example:

* Sprinting.
* Endurance.
* Acceleration.
* Recovery.
* Agility.
* Temperament.

There should be trade-offs.

Do not allow every horse to become equally excellent at everything.

### 11.4 Existing horses

Migrate existing career horses safely.

Preserve:

* Current ratings.
* Potential.
* Training.
* Appearance.
* Records.
* Names.
* Achievements.

Existing horses should not suddenly become weaker because the progression system changed.

If the new career length requires slower future growth, migrate carefully and explain the new rules.

## 12. HORSE FITNESS AND RECOVERY

I want recovery to matter without becoming tedious.

A horse should not necessarily be at its absolute best after racing continuously.

However, recovery should not take an excessively long time.

### 12.1 Post-race condition

After a race, horses may experience temporary fatigue depending on:

* Race distance.
* Effort used.
* Track conditions.
* Horse endurance.
* Recovery attributes.
* Facility level.

### 12.2 Recovery

Condition should generally recover over a short, manageable period of career time.

Avoid forcing players to skip large parts of the calendar after every race.

### 12.3 Recovery facilities

Better facilities should improve the recovery process.

### 12.4 Veterinary care

Veterinary staff can help maintain horse condition and manage occasional minor setbacks.

Avoid intrusive random injuries that repeatedly prevent the player from racing.

Serious injuries should be rare, carefully balanced and not used as a constant punishment.

### 12.5 Welfare and gameplay

Do not reward irresponsible over-racing of exhausted horses.

Encourage sensible race scheduling through small, understandable performance consequences.

## 13. CREATE THE FINANCIAL SYSTEM

The game should now have a real stable economy.

The economy must be meaningful but not excessively difficult or grindy.

Players should earn money, invest it and make decisions.

However, the game should not become an accounting simulator.

### 13.1 Starting position

The player begins with:

* A modest but respectable farm.
* A basic farmhouse.
* Five available horse stalls.
* One custom-created horse.
* Basic training facilities.
* Some starting cash.
* Enough resources to enter early races.

The property should already be usable.

Do not begin with a ruined farm or no functioning facilities.

### 13.2 Income

Possible income sources:

* Race prize money.
* Championship rewards.
* Major-race bonuses.
* Career milestone rewards.
* Modest sponsorships.
* Occasional stable achievements.

Prioritise race winnings as the main source of income.

### 13.3 Expenses

Include sensible costs such as:

* Horse feed.
* Basic horse care.
* Staff wages.
* Race entry fees where appropriate.
* Training facility maintenance.
* Horse purchases.
* Facility upgrades.
* Veterinary services.

Do not require the player to pay dozens of tiny bills manually.

Use a clear summary of expenses.

### 13.4 Currency

Display financial values in Australian dollars.

Use fictional, gameplay-balanced amounts inspired by the scale of Australian racing.

Do not claim invented game prices are exact real-world racing costs.

### 13.5 Prevent bankruptcy traps

Avoid a situation where the player cannot race, cannot earn money and has no way to recover.

If finances become difficult, provide reasonable options such as:

* Lower-cost races.
* Reduced staff expenditure.
* Selling a horse.
* Pausing optional upgrades.
* Modest emergency financing or support if appropriately balanced.

The economy should reward good decisions without causing frequent unrecoverable career failure.

## 14. ECONOMY BALANCING

Balance the finances against actual race opportunities.

A typical early-career player should be able to:

* Maintain one horse.
* Enter regular suitable races.
* Afford essential care.
* Make progress towards a first modest upgrade.
* Save towards a second horse.

Major facility upgrades should take longer.

Elite horses and high-end facilities should require sustained career success.

However, do not make every improvement take dozens of hours.

### 14.1 Suggested progression

**Early career**

Affordable basic improvements.

**Developing stable**

Better training, staff and a second horse.

**Established stable**

Several horses, specialised training and more important races.

**Elite stable**

Advanced facilities, strong staff and elite-level horses.

### 14.2 Financial reporting

The farmhouse office should include:

* Current cash.
* Recent prize money.
* Upcoming expenses.
* Facility upgrade costs.
* Staff wages.
* Horse purchase expenditure.
* Seasonal financial summary.

Use simple, readable menus.

### 14.3 Save transactions

Financial transactions must be atomic and persistent.

Do not allow:

* Duplicate prize-money claims.
* Buying the same horse twice.
* Repeated upgrade purchases without payment.
* Negative balances caused by UI bugs.
* Lost money after returning from races.

## 15. FACILITY UPGRADES

The player should be able to spend money improving the property.

Upgrades should provide real gameplay benefits, but only modest 3D changes.

I specifically do not want Claude to rebuild the entire farm whenever a facility is upgraded.

### 15.1 Basic facilities

Suggested upgrade categories:

**Training equipment**

Improves training efficiency.

**Training track**

Improves the effectiveness of selected physical training activities.

**Recovery facilities**

Improves post-race recovery.

**Stable comfort**

Improves condition consistency.

**Feed and care facilities**

Improves routine care efficiency.

**Starting-gate practice**

Improves the effectiveness of starting-related training.

**Veterinary equipment**

Improves minor health management.

### 15.2 Upgrade levels

Use a manageable number of levels.

For example:

* Basic.
* Improved.
* Professional.
* Elite.

Not every facility needs four levels if fewer would be better.

### 15.3 Benefits

Upgrades should affect measurable systems.

Examples:

* Training efficiency.
* Recovery efficiency.
* Condition consistency.
* Staff effectiveness.
* Certain training activity availability.

They should not directly grant enormous permanent speed increases.

### 15.4 Prevent pay-to-win effects

Facilities should make development more efficient.

They should not allow a poorly developed horse to become unrealistically fast merely because the player has money.

Horse potential and racing ability must still matter.

### 15.5 Limited visual changes

Use small changes such as:

* New equipment.
* Upgraded signage.
* Improved floor surfaces.
* Additional training objects.
* Better lighting.
* Modest building details.

Keep the existing building footprints where practical.

Avoid completely replacing major farm structures after every upgrade.

## 16. STABLE STAFF

Allow the player to hire staff.

Keep the system meaningful but reasonably simple.

### 16.1 Trainer

Improves training efficiency.

May offer specialisation in:

* Sprinting.
* Stamina.
* Starting.
* Temperament.
* General development.

### 16.2 Groom

Improves routine care and consistency.

Reduces the need for manual daily grooming.

### 16.3 Veterinarian

Supports recovery and health management.

### 16.4 Staff quality

Staff can have modest quality tiers or skill levels.

Better staff cost more.

### 16.5 Wages

Wages should be recurring but clearly explained.

### 16.6 Visual representation

Staff may appear as simple 3D characters around relevant farm areas.

They do not need complex autonomous daily routines.

### 16.7 Interaction

Approaching a staff member can open their management interface.

Alternatively, manage staff through the farmhouse office.

### 16.8 Avoid complexity

Do not introduce detailed employment contracts, individual shift rosters, staff morale crises or other systems that distract from racing.

## 17. HORSE PURCHASES AND AUCTIONS

The player begins by creating their first horse.

Later, they should be able to acquire additional horses.

Preserve the maximum of five active horses.

### 17.1 Auction system

Create a horse marketplace or auction interface.

Offer a rotating selection of horses.

Each horse should have:

* Name.
* Age.
* Appearance.
* Current racing ability.
* Development potential.
* Preferred distances.
* Temperament.
* Racing record where applicable.
* Asking price or auction estimate.

### 17.2 Horse quality

Include different types of purchases:

* Inexpensive developing horses.
* Promising young prospects.
* Experienced race-ready horses.
* Late-maturing horses.
* Expensive established performers.

### 17.3 Avoid perfect information

An auction should involve some judgement.

However, do not make prices entirely random or hide all meaningful information.

Give the player enough details to make informed decisions.

### 17.4 Auctions versus private sales

Allow purchases through suitable marketplace formats.

A simplified bidding system is acceptable.

Do not create an excessively complicated auction simulator unless it materially improves the experience.

### 17.5 Custom-created additional horses

I also want the option to pay money to create another horse using the existing horse creator.

This must be balanced.

Custom creation should not provide a cheap way to generate elite horses with perfect potential.

Use a fair cost and attribute budget.

### 17.6 Selling horses

Allow the player to sell horses if they need stable space or money.

Use a reasonable valuation based on:

* Age.
* Ability.
* Potential.
* Form.
* Record.
* Health.

Protect against accidental sales with confirmation.

## 18. HORSE RETIREMENT AND LEGACY

Horses should eventually retire.

This is important because I want a longer career involving multiple generations of successful racehorses, even though full breeding mechanics can wait until later.

### 18.1 Retirement

Allow retirement when:

* The horse is ageing.
* Performance has declined.
* The player chooses to retire it.
* The horse has completed a notable career.

### 18.2 Hall of fame

Preserve retired horses in a permanent stable history.

Include:

* Name.
* Appearance.
* Final age.
* Career starts.
* Wins.
* Placings.
* Prize money.
* Major victories.
* Best achievements.
* Championship titles.

### 18.3 Trophy room

Connect major achievements to the existing trophy system.

The player's greatest horses should remain part of the stable's history.

### 18.4 Avoid permanent clutter

Retired horses do not need to remain permanently rendered in occupied stalls.

The active stable remains limited to five horses.

### 18.5 Future breeding support

Structure the data so breeding can potentially be added later.

Do not implement a full breeding system in this update.

## 19. THE FARMHOUSE — CAREER HEADQUARTERS

The farmhouse should serve as the central career office.

The player physically walks to it.

Approaching the entrance should allow the player to enter a simple interior or interact with an office interface.

A full detailed house interior is not necessary if it would consume too much performance or development time.

### 19.1 Main office

Show:

* Upcoming races.
* Calendar.
* Stable finances.
* Horse roster.
* Staff.
* Facility status.
* Championship standings.
* Major-event qualification.
* Career achievements.

### 19.2 Racing calendar

The calendar should be a prominent feature.

Show upcoming events with:

* Date.
* Venue.
* Race name.
* Distance.
* Grade.
* Eligibility.
* Prize money.
* Track condition where known.
* Scheduled time of day.
* Available horse entries.

### 19.3 Horse records

Allow selection of individual horses.

Show their progression history, recent races and development.

### 19.4 Finances

Include an accessible financial dashboard.

### 19.5 Facility management

Show upgrade options and benefits.

### 19.6 Quick access

Although the office is physically accessible, also provide an optional shortcut for players who prefer efficient menus.

The game should not force unnecessary walking between every career action.

## 20. CALENDAR-BASED TIME PROGRESSION

Time should advance when the player chooses the next activity.

Do not use a continuous real-time day/night system as the main career clock.

### 20.1 Career calendar

Track:

* Day.
* Month.
* Year.
* Season.
* Upcoming events.
* Training activities.
* Horse recovery.
* Financial expenses.

### 20.2 Advancing time

The player may:

* Perform an activity.
* Schedule training.
* Advance to the next day.
* Advance to the next available race.
* Travel to a race.

### 20.3 Career time consistency

Time progression should affect:

* Horse age.
* Training.
* Fitness.
* Recovery.
* Staff wages.
* Facility expenses.
* Auction listings.
* Race eligibility.

### 20.4 Avoid exploits

Do not allow players to repeatedly return to the same calendar date to collect benefits.

### 20.5 Prevent missed important races

Warn the player if advancing time would skip an entered race or major scheduled event.

### 20.6 Training schedules

Allow players to select reasonable automatic training between races.

Avoid requiring manual input every single day.

## 21. A MUCH BIGGER AUSTRALIAN RACING CALENDAR

I want a meaningful long-term Australian racing calendar.

Keep the two detailed flagship racecourses:

* Royal Randwick.
* Flemington.

Add perhaps one or two much simpler country-style racing venues to support early career development.

### 21.1 Grassroots racing

Early in the career, the player should enter accessible lower-grade races.

These should feel suitable for a developing horse.

### 21.2 Country racecourse environments

Create one or two simple but convincing country racecourse models.

Use:

* Smaller grandstands.
* Basic spectator areas.
* Turf circuits.
* Modest buildings.
* Fewer crowds.
* Simpler landscaping.

These should be substantially cheaper to render than Randwick and Flemington.

Do not spend as much development time on them as on the two flagship venues.

### 21.3 Flagship venues

The most important events should continue using the highly detailed existing racecourses.

### 21.4 Race hierarchy

Create a clear sense of progression.

For example:

* Maiden races.
* Lower-grade country races.
* Stronger local races.
* Metropolitan races.
* Feature races.
* Group races.
* Major championship events.

Use plausible Australian racing terminology.

### 21.5 Eligibility

Race eligibility should depend on appropriate factors such as:

* Horse age.
* Horse record.
* Career grade.
* Race conditions.
* Championship qualification.

Do not allow a beginner horse to enter every elite event immediately.

### 21.6 Winnable early races

This is extremely important.

A new horse should have a realistic chance of winning suitable early-career races.

Do not make the first ten races a sequence of unavoidable losses.

Use appropriately graded AI opponents.

The player should be able to progress through good riding and development.

### 21.7 Realistic progression

A horse should move gradually from lower-level racing towards more prestigious events.

Do not force every horse to become a Melbourne Cup winner.

Some horses may be better suited to shorter distances or lower grades.

That should still be a rewarding career.

## 22. RACES AT DIFFERENT TIMES OF DAY

I specifically want races to take place at different scheduled times.

The current game should no longer make every race feel like the same sunny afternoon.

### 22.1 Supported lighting conditions

Include believable:

* Early morning.
* Mid-morning.
* Midday.
* Afternoon.
* Late afternoon.
* Golden-hour sunset.
* Dusk where suitable.
* Evening only where the venue and lighting setup support it.

### 22.2 Environmental changes

Adjust:

* Sun angle.
* Sky colour.
* Shadow length.
* Ambient light.
* Exposure.
* Colour temperature.
* Environmental haze.
* Trackside lighting where necessary.

### 22.3 Golden-hour races

Late-afternoon races should have warm, low sunlight and long shadows.

Keep the racing surface clearly visible.

### 22.4 Morning races

Morning events may have cooler sunlight and softer shadows.

### 22.5 Midday races

Use bright, natural Australian daylight.

### 22.6 Dusk

Dusk should look atmospheric but not too dark to race.

### 22.7 Race scheduling

Time of day should come from the career race schedule, not be assigned completely randomly every time.

A race should retain its scheduled time if the player views the event details and then enters it.

### 22.8 Performance

Use efficient lighting presets.

Do not rebuild expensive scenery or regenerate entire textures for each time of day.

Avoid multiple unnecessary dynamic lights.

## 23. WEATHER AND TRACK CONDITIONS

Integrate weather into the race calendar.

Use reasonable weather conditions based on location and time of year.

### 23.1 Weather types

Support:

* Clear.
* Partly cloudy.
* Overcast.
* Light rain.
* Rain where appropriate.

### 23.2 Track conditions

Support appropriate turf conditions such as:

* Good.
* Soft.
* Heavy.

Use a consistent game model.

### 23.3 Gameplay

Weather and going should affect race performance in a believable, balanced way.

Different horses may have preferences.

However, keep the effects moderate.

Do not introduce random weather penalties that make races unwinnable.

### 23.4 Visuals

Use suitable turf and lighting changes.

Rain effects should be performance-conscious.

### 23.5 No impossible conditions

Do not schedule unrealistic night races at venues without appropriate lighting.

Do not apply arbitrary extreme weather to every race.

### 23.6 Forecasts

The player should have some indication of the expected track conditions before entering a race.

This makes horse selection meaningful.

## 24. HORSE TRANSPORT AND EVENT ARRIVAL

I want a brief transition from the farm to the racecourse.

### 24.1 Transport area

Create a horse transport vehicle or trailer at the property.

The player can approach it to enter scheduled races.

### 24.2 Departure

Provide a short transition showing or implying the horse travelling to the venue.

A brief animated loading scene or cinematic transition is sufficient.

### 24.3 Avoid unnecessary complexity

Do not implement vehicle driving.

Do not build full roads between the farm and racecourses.

### 24.4 Skippable

Allow the transition to be skipped.

### 24.5 Save state

Before leaving the farm:

* Save the current career state.
* Record the selected event.
* Record the chosen horse.
* Commit relevant preparation decisions.

Then load the racecourse.

### 24.6 Returning

After results:

* Apply race rewards.
* Apply development.
* Update form and fitness.
* Update career records.
* Update calendar.
* Return to the farm.

Ensure results are not applied twice.

## 25. CRITICAL — SEPARATE FARM AND RACE SCENES

This is a non-negotiable technical requirement.

The current game has previously suffered from noticeable rendering stutter.

A new 3D farm must not worsen racing performance.

### 25.1 Farm scene

When the player is on the farm, load only:

* Farm terrain.
* Farmhouse.
* Stables.
* Stable horses.
* Training facilities.
* Paddocks.
* Farm NPCs.
* Relevant props.
* Farm lighting.

Do not keep Randwick or Flemington's grandstands, crowds and race-specific assets active.

### 25.2 Race scene

When the player starts a race, unload or deactivate the farm scene.

Load only:

* Selected racecourse.
* Racing horses.
* Jockeys.
* Race crowds.
* Race lighting.
* Race HUD.
* Commentary assets required for the event.

### 25.3 Shared career data

Maintain a central persistent state containing:

* Stable finances.
* Horse attributes.
* Horse appearances.
* Horse ages.
* Horse fitness.
* Horse records.
* Facility levels.
* Staff.
* Calendar.
* Championship.
* Retired horses.
* Career achievements.

Both scenes read and update this data through controlled interfaces.

### 25.4 Resource cleanup

When leaving a scene:

* Dispose of unused geometry where appropriate.
* Release unused textures and materials.
* Stop inactive animation systems.
* Remove event listeners tied to that scene.
* Remove unnecessary UI handlers.
* Stop irrelevant audio.
* Release inactive resources.

Be careful with shared resources that remain necessary.

### 25.5 Prevent memory leaks

Repeatedly travelling from farm to race and back must not cause continuously increasing memory use.

Test several transitions in a row.

### 25.6 Input separation

Farm movement controls and horse-riding controls must be isolated.

Do not allow a farm movement key to trigger a horse-racing action because an old input handler remains active.

### 25.7 Scene-specific performance

Optimise both environments independently.

The farm should not maintain an active 120Hz race simulation.

The race scene should not update inactive farm NPCs or animals.

## 26. PERFORMANCE REQUIREMENTS

Preserve the graphical quality that Final Furlong has achieved.

### 26.1 Target

Aim for smooth 60 FPS on a suitable modern desktop or laptop.

Do not guarantee this on all hardware.

### 26.2 Farm performance

Use:

* Efficient 3D assets.
* Shared materials.
* Sensible shadows.
* Distance-based detail.
* Lightweight horse idle animations.
* Limited active NPC animation.
* Frustum culling.

### 26.3 Race performance

Do not degrade the existing optimised racecourse rendering.

### 26.4 Scene transition performance

Avoid freezing the browser for long periods during scene changes.

Use appropriate loading screens or progress indicators.

### 26.5 Memory

Monitor active textures, geometry and heap usage.

### 26.6 Auto graphics settings

Preserve the existing graphics settings and automatic quality system.

Apply suitable settings to the farm environment as well.

### 26.7 Profiling

Measure performance rather than assuming the separation alone fixes all problems.

## 27. UI AND QUALITY OF LIFE

The new Career Mode must be easy to navigate.

### 27.1 World interaction

Show contextual interaction prompts.

### 27.2 Farm map

Provide a simple farm map or navigation screen.

### 27.3 Career dashboard

The farmhouse office should have a clear, polished dashboard.

### 27.4 Horse selection

Allow easy switching between the five horses.

### 27.5 Activity shortcuts

Provide optional shortcuts so players can access activities quickly.

### 27.6 Time progression

Clearly display the current career date.

### 27.7 Notifications

Notify the player about:

* Upcoming races.
* Training completion.
* Recovery completion.
* Staff expenses.
* New auction listings.
* Facility upgrade completion.
* Horse milestones.

Avoid constant pop-ups.

### 27.8 Accessibility

Use readable text, sensible controls and clear indicators.

Do not hide important gameplay information behind complicated 3D interactions.

## 28. CAREER BALANCE AND PROGRESSION

The overall career should take substantially longer than before.

However, the player should always feel that something worthwhile is happening.

**Early career**

The player has:

* One custom-created horse.
* Basic property.
* Basic training equipment.
* Limited but reasonable funds.
* Accessible lower-grade races.

They should be able to compete and occasionally win.

**Developing career**

The player earns enough money to:

* Upgrade facilities.
* Hire basic staff.
* Purchase another horse.
* Improve training efficiency.
* Enter stronger races.

**Established career**

The stable may have:

* Several competitive horses.
* Better facilities.
* Experienced staff.
* Major-race contenders.
* A record of achievements.

**Elite career**

The player aims to:

* Win major Australian races.
* Develop horses to elite potential.
* Build strong stable finances.
* Maintain a high-quality five-horse roster.
* Earn major championship honours.
* Establish a lasting stable legacy.

**Long-term legacy**

Over many seasons, the player may retire successful horses and develop new ones.

The stable's hall of fame should document this history.

## 29. SAVE MIGRATION — EXTREMELY IMPORTANT

Existing players must not lose their current career.

The current save system already contains:

* Horses.
* Attributes.
* Potential.
* Records.
* Progress.
* Championships.
* Appearance data.
* Other career information.

Introduce a versioned save migration.

### 29.1 Preserve existing horses

Do not delete or recreate existing horses.

### 29.2 Preserve existing progress

Keep previously earned achievements, wins and trophies.

### 29.3 Introduce new fields safely

Add defaults for:

* Cash.
* Staff.
* Facilities.
* Career calendar.
* Horse age.
* Fitness.
* Retirement state.
* Farmhouse state.
* Character appearance.

### 29.4 Avoid punishing old saves

Do not introduce enormous retroactive expenses.

### 29.5 New career versus existing career

A new career can begin with the full new starting package.

Existing careers should migrate into an equivalent reasonable state.

### 29.6 Recovery

Provide a safe way to export and import career saves where feasible.

Avoid silently overwriting working saves with corrupted data.

### 29.7 Test persistence

Verify data survives:

* Reloading.
* Farm-to-race transitions.
* Race-to-farm transitions.
* Buying a horse.
* Selling a horse.
* Hiring staff.
* Buying upgrades.
* Advancing the calendar.
* Retiring a horse.

## 30. IMPLEMENTATION PHASES

This is a very large update.

Do not try to implement everything in one unstructured rewrite.

Follow a controlled sequence.

### PHASE 1 — Existing project audit

Inspect:

* Current Career Mode.
* Stable scene.
* Horse creator.
* Existing horse models.
* Current training systems.
* Racing calendar.
* Save structure.
* Graphics pipeline.
* Scene lifecycle.
* Race entry and results.

Record existing functionality and identify what can be reused.

### PHASE 2 — Career data architecture

Build or extend the data model for:

* Stable economy.
* Horse ages.
* Fitness and development.
* Staff.
* Facilities.
* Calendar.
* Retirement.
* Auction listings.
* Persistent records.

Implement save migration before major UI changes.

### PHASE 3 — Scene separation

Create reliable farm and race scene boundaries.

Implement:

* Loading.
* Unloading.
* Resource cleanup.
* Input switching.
* Shared career data.
* Scene transitions.

Verify existing races still work.

### PHASE 4 — Farm environment

Build the medium-sized Australian training property.

Include:

* Farmhouse.
* Stable block.
* Five stalls.
* Grooming area.
* Paddocks.
* Training area.
* Vet area.
* Transport area.

Use existing horse assets where appropriate.

### PHASE 5 — Third-person character

Implement:

* Character appearance.
* Movement.
* Camera.
* Collision.
* Interactions.
* Outfit customisation.

Test movement around the full farm.

### PHASE 6 — Farm interactions

Add:

* Horse inspection.
* Grooming.
* Feeding.
* Stable management.
* Farmhouse office.
* Training interactions.
* Facility interactions.
* Transport interaction.

### PHASE 7 — Finances

Implement:

* Starting cash.
* Prize money.
* Expenses.
* Purchases.
* Financial summaries.
* Upgrade spending.

Balance costs against race rewards.

### PHASE 8 — Staff and facilities

Implement:

* Staff hiring.
* Wages.
* Facility upgrades.
* Real gameplay benefits.
* Limited visual improvements.

### PHASE 9 — Long-term horse development

Implement:

* Ageing.
* Multi-season growth.
* Long-term potential.
* Fitness.
* Recovery.
* Form.
* Retirement.
* Hall of fame.

Preserve existing horse attributes.

### PHASE 10 — Horse marketplace

Implement:

* Auctions.
* Purchases.
* Sales.
* Paid additional custom-horse creation.
* Five-horse capacity limit.

### PHASE 11 — Racing calendar expansion

Implement:

* A more extensive Australian calendar.
* Grade progression.
* Country races.
* Two simpler country environments if feasible.
* Appropriate eligibility.
* Major-race schedules.

Preserve Randwick and Flemington as the flagship venues.

### PHASE 12 — Time-of-day and weather

Implement:

* Scheduled race times.
* Lighting presets.
* Weather.
* Track conditions.
* Environment settings.

Ensure performance remains acceptable.

### PHASE 13 — Transport transitions

Implement:

* Race selection from the farm.
* Horse preparation.
* Brief travel transition.
* Race scene loading.
* Result processing.
* Farm return.

### PHASE 14 — Balance and testing

Test:

* Early career.
* Multi-season progression.
* Horse purchases.
* Expenses.
* Training.
* Facility upgrades.
* Race eligibility.
* Retirement.
* Save migration.
* Scene memory.
* Race performance.

Do not claim work is complete without testing.

## 31. REQUIRED TESTS — FARM AND CHARACTER

Test:

1. Character spawns correctly.
2. Character movement works.
3. Camera follows smoothly.
4. Character cannot walk through solid buildings.
5. Character can approach the farmhouse.
6. Office opens correctly.
7. Character can visit all five stalls.
8. Correct horses are displayed.
9. Horse appearances persist.
10. Grooming works.
11. Feeding works.
12. Training interactions work.
13. Paddock horses animate appropriately.
14. Farm map works.
15. Character appearance saves.
16. Farm controls do not interfere with racing controls.

## 32. REQUIRED TESTS — CAREER ECONOMY

Test:

1. Starting cash is correct.
2. Prize money is awarded once.
3. Expenses are deducted correctly.
4. Staff wages are charged correctly.
5. Facility purchases deduct money once.
6. Facility benefits apply.
7. Insufficient funds block purchases.
8. Horse purchases work.
9. Horse sales work.
10. Five-horse capacity is respected.
11. Paid custom-horse creation cannot bypass the economy.
12. Financial history persists.
13. Calendar advancement does not duplicate rewards.
14. The player cannot easily exploit repeated actions for free money.

## 33. REQUIRED TESTS — LONG-TERM HORSE DEVELOPMENT

Test:

1. Existing horses retain attributes.
2. Training improves appropriate attributes.
3. Potential ceilings remain meaningful.
4. Horse development spans multiple seasons.
5. Training does not allow unlimited grinding.
6. Fitness changes appropriately.
7. Recovery works.
8. Facilities affect training and recovery.
9. Staff benefits apply.
10. Ageing changes development appropriately.
11. Horses can race across multiple seasons.
12. Retirement preserves records.
13. Retired horses enter the hall of fame.
14. Career records survive reloads.

## 34. REQUIRED TESTS — RACING CALENDAR

Test:

1. Race dates advance correctly.
2. Upcoming events display correctly.
3. Eligibility works.
4. Lower-grade races are competitive for beginners.
5. The Everest remains available through appropriate progression.
6. The Melbourne Cup remains available through appropriate progression.
7. Country racecourses load correctly.
8. Randwick loads correctly.
9. Flemington loads correctly.
10. Time-of-day lighting matches the event.
11. Weather and track conditions are applied consistently.
12. Race results update the calendar and stable correctly.

## 35. REQUIRED TESTS — SCENE PERFORMANCE

Test:

1. Farm loads without loading all racecourse assets.
2. Leaving the farm releases unnecessary assets.
3. The selected racecourse loads correctly.
4. Race physics works as before.
5. Race performance is not noticeably degraded.
6. Returning to the farm works.
7. Repeated farm/race transitions do not cause memory leaks.
8. Farm controls do not remain active in races.
9. Racing controls do not activate while walking.
10. Commentary does not continue playing incorrectly after a race.
11. Saving and loading during transitions is reliable.
12. Extended play does not cause progressive FPS degradation.

## 36. REQUIRED SINGLE-PLAYER REGRESSION TESTS

Preserve and test:

* Quick Race.
* Career Mode.
* Championship Mode.
* Royal Randwick.
* Flemington.
* Existing race physics.
* Horse steering.
* Starting mechanics.
* Sprint rhythm.
* Jockey controls.
* Horse stamina.
* AI jockeys.
* Pack racing.
* Collisions.
* Horse falls.
* Chaos Mode in Quick Race.
* Camera modes.
* Commentary.
* Photo-finish replay.
* Race results.
* Horse customisation.
* Jockey silks.
* Career saving.

Do not break the racing experience while expanding Career Mode.

## 37. WHAT I DO NOT WANT

Do not:

* Rebuild the whole game from scratch.
* Replace the existing horses with low-quality models.
* Build a massive empty open world.
* Make the farmhouse overly elaborate.
* Create enormous new detailed racecourses.
* Add online racing features.
* Increase the five-horse limit.
* Make every stable upgrade require rebuilding an entire 3D structure.
* Introduce endless manual chores.
* Force daily feeding and grooming interactions.
* Make recovery take excessive amounts of time.
* Make early Career Mode unwinnable.
* Make training progression unrealistically fast.
* Make horse development a pointless grind.
* Let every horse become equally elite.
* Add an overly punishing economy.
* Create frequent unavoidable financial failure.
* Add a full breeding system yet.
* Make all horses retire at the exact same age.
* Use the same race lighting for every event.
* Introduce unrealistic night races without appropriate venue lighting.
* Load the farm and full racecourse simultaneously.
* Leave unused assets active during scene transitions.
* Break the existing race controls.
* Break the current commentary system.
* Break racing physics.
* Break existing saves.
* Claim something was tested when it was not.

## 38. WHAT I WANT THE GAME TO FEEL LIKE

Imagine I start a new Career Mode.

I arrive at my own modest Australian horse training property.

I have a farmhouse, a stable block with room for five horses, a few paddocks and a simple training area.

I create my first thoroughbred and customise its appearance and racing potential.

I then walk around the property as my own 3D character.

I enter the stable and find my horse waiting in its stall.

The horse looks around, shifts its weight and moves naturally.

I inspect its current condition, groom it and prepare a training programme.

I walk to the training area.

I participate in a short starting-gate training session, improving my horse's development slightly.

Later, I walk towards the farmhouse.

Inside the office, I open the racing calendar.

I see upcoming races, including several suitable lower-grade events.

I choose a country race for my first horse.

I walk to the transport area and select the event.

A brief departure transition plays.

The farm unloads.

The country racecourse loads.

I ride the race using all the existing Final Furlong controls.

I manage my horse's effort, maintain a good racing position and launch my sprint.

I finish second in my first race.

The result is applied.

I receive the appropriate prize money and development progress.

I return to my farm.

My finances have changed.

My horse has gained racing experience but needs a little recovery.

I advance the calendar, schedule some training and prepare for another event.

Over the following weeks, my horse becomes more competitive.

Eventually, I win my first race.

I use the winnings to buy improved training equipment.

The upgraded facility visibly gains some new equipment, and training becomes more efficient.

After more progress, I hire a trainer and buy a second horse at auction.

Several seasons later, I have developed a strong stable.

I own multiple horses with different abilities and specialisations.

Some are young and improving.

Others are mature and ready for major races.

One has become a genuine contender for The Everest.

I enter the race at Royal Randwick.

This time, the highly detailed racecourse loads with a large crowd, appropriate lighting and professional commentary.

My horse wins a dramatic finish.

The victory earns significant prize money, improves my reputation and becomes part of the stable's history.

Later, I develop a staying horse capable of competing in the Melbourne Cup.

Years pass.

Some horses retire.

Their records remain in my hall of fame.

New prospects join the stable.

My property becomes better equipped, my staff become stronger and my horses compete at increasingly prestigious levels.

The career should feel like a long journey from a respectable small Australian stable to one of the country's most successful thoroughbred racing operations.

Most importantly, every major achievement should feel earned through good racing, effective training and intelligent decisions.

## 39. FINAL DELIVERY REQUIREMENTS

Implement the new Career Mode directly in the latest Final Furlong project.

Provide the complete updated working files and all necessary assets.

Include a detailed report explaining:

**3D farm**

* Farm layout.
* Character controls.
* Camera system.
* Interaction system.
* Horse stalls.
* Horse activities.
* Training area.
* Farmhouse office.

**Economy**

* Starting finances.
* Income.
* Expenses.
* Facility costs.
* Staff wages.
* Horse prices.
* Financial balancing.

**Horse development**

* Long-term progression.
* Training.
* Potential.
* Fitness.
* Recovery.
* Ageing.
* Retirement.
* Hall of fame.

**Racing calendar**

* New race schedule.
* Country racing venues.
* Race eligibility.
* Time-of-day lighting.
* Weather.
* Track conditions.

**Technical architecture**

* Farm scene.
* Race scene.
* Scene transitions.
* Shared career data.
* Asset loading.
* Resource unloading.
* Input separation.
* Memory management.
* Performance results.

**Compatibility**

* Existing career migration.
* Existing horse saves.
* Existing championship progress.
* Existing race physics.
* Existing commentary.
* Existing racing controls.
* Single-player regression tests.

**Known limitations**

Clearly state any features that remain incomplete.

Do not claim fully implemented features that are only placeholders.

Do not claim performance targets without measurements.

If the complete overhaul cannot reasonably fit into a single development pass, prioritise a fully functional integrated foundation containing:

1. A walkable 3D farm.
2. A controllable third-person character.
3. Working five-horse stables.
4. The farmhouse calendar and finance interface.
5. Basic horse care and training.
6. Working facility upgrades.
7. Longer-term progression and horse ageing.
8. Reliable farm-to-race transitions.
9. Save compatibility.
10. Preservation of all existing single-player racing.

Then expand auctions, staff depth, additional country venues and more elaborate interactions without sacrificing the working foundation.

Do not use unfinished placeholder systems as proof that the entire upgrade has been completed.

The main priorities are:

A believable explorable Australian stable, meaningful long-term horse development, enjoyable financial and facility management, a fuller racing calendar, and reliable separation between the farm and race environments so Final Furlong remains smooth and enjoyable to play.

Build and test the best complete implementation possible using the latest project already available to you.
