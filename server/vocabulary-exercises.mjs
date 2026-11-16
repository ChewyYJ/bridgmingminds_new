// Each scenario has a short reading, a recall blank and a transfer question.
// The scheduler alternates contexts for a word.
const contexts = {
  collaborate: [
    [
      "The school podcast",
      "Maya records interviews and Ben edits sound. They need to ____ to get the school podcast ready by Friday.",
      "How could two people with different skills work together to help at a community event?",
    ],
    [
      "Getting dinner ready",
      "There are six hungry guests and only twenty minutes. One friend chops vegetables while another sets the table. They ____ so everyone can eat on time.",
      "Describe how teammates could share the work on a project with a deadline.",
    ],
  ],
  accessible: [
    [
      "A school video",
      "The class adds captions to its video so viewers can read the dialogue. That makes the video more ____ to people who cannot hear the audio.",
      "Suggest one change that would make a school event easier for more people to take part in.",
    ],
    [
      "Directions at the station",
      "The station puts large signs at eye level and announces each platform change. The directions are more ____ to travellers with different needs.",
      "What would make a website easier for people with different needs to use?",
    ],
  ],
  perspective: [
    [
      "Two views of lunchtime",
      "Sam likes a busy lunchroom. Noor finds the noise tiring. From Noor’s ____, a quiet corner would make lunchtime easier.",
      "Describe a disagreement and explain how it might look to the other person.",
    ],
    [
      "The new bus route",
      "The driver likes the direct route because it saves time. A passenger who lives farther from the new stop has a different ____ on the change.",
      "How might a new student and a teacher view the same school rule differently?",
    ],
  ],
  evidence: [
    [
      "A plant experiment",
      "A class thinks the plant by the window grows faster. They measure both plants every Friday. Their records give them ____ to support or question the claim.",
      "How could you find out whether a quieter room helps you study?",
    ],
    [
      "The broken gate",
      "A caretaker says the gate was damaged during the storm. A time-stamped photo of the gate before the storm is one piece of ____ the caretaker can use.",
      "What information would help you check a claim that a bus is usually late?",
    ],
  ],
  assumption: [
    [
      "Planning a picnic",
      "The group brings no umbrellas because they expect clear skies. They realise that their plan rests on an ____ about the weather.",
      "What might someone take for granted when planning to meet friends somewhere unfamiliar?",
    ],
    [
      "A shared presentation",
      "Kai schedules an online practice without asking the group. His ____ is that everyone has a good internet connection at home.",
      "Describe one belief about an audience you would want to check before giving a talk.",
    ],
  ],
  "trade-off": [
    [
      "Choosing a bus",
      "The express bus saves fifteen minutes, but the fare is higher. The commuter considers the ____ before deciding which ticket to buy.",
      "Describe a decision where saving money might cost you time.",
    ],
    [
      "Fitting everyone in",
      "A smaller club meeting gives each person more time to speak but leaves fewer places available. The organisers must decide if that ____ is worth it.",
      "What could you gain and give up by choosing a shorter group presentation?",
    ],
  ],
  adapt: [
    [
      "Practice in the rain",
      "Rain closes the football field. The coach decides to ____ the practice by moving it indoors and using shorter drills.",
      "How would you change a group activity for a smaller space?",
    ],
    [
      "A recipe with a missing ingredient",
      "There are no fresh tomatoes left. Jo can ____ the recipe by using canned tomatoes and reducing the added water.",
      "Describe how you would change your study plan if you had half as much time.",
    ],
  ],
  clarify: [
    [
      "The group chat",
      "A message says to meet near the library. The group asks Alex to ____ which entrance and what time they mean.",
      "Describe something you could do to make vague instructions easier to follow.",
    ],
    [
      "A science explanation",
      "The term evaporation confuses some learners. To ____ the idea, the teacher asks them to picture a puddle slowly disappearing.",
      "How could you make an unfamiliar idea easier to understand in a presentation?",
    ],
  ],
  reliable: [
    [
      "Picking an alarm",
      "An alarm rings at the right time every day for two weeks. Lee decides it is ____ enough to use on exam day.",
      "What would you check before trusting a new source for your schoolwork?",
    ],
    [
      "Checking a thermometer",
      "The group tries the thermometer several times in the same conditions. Its readings hardly change, which suggests it is ____ for their experiment.",
      "What would make a classmate someone you can depend on for a group task?",
    ],
  ],
  baseline: [
    [
      "Practice scores",
      "Before changing her study routine, Lina takes a short quiz. She uses that score as a ____ to compare with her results after a week.",
      "What starting measurement would you record before trying a new exercise routine?",
    ],
    [
      "Saving electricity",
      "The club records how much electricity its room uses before switching to LED lights. That reading gives them a ____ for measuring any savings.",
      "How would you establish a starting point before testing a plan to reduce food waste?",
    ],
  ],
  quantify: [
    [
      "The lunch queue",
      "Students say the lunch queue is slower. To ____ the delay, the council records waiting times in minutes.",
      "How could you measure how much time a different bus route would save?",
    ],
    [
      "Food left over",
      "The cafeteria wants to ____ how much food goes uneaten, so staff weigh the leftovers at the end of each day.",
      "Name a change at school you could describe using numbers and explain what you would count.",
    ],
  ],
  fluctuate: [
    [
      "The busy swimming pool",
      "The number of visitors can ____ throughout the day. It rises after school, falls at dinnertime and rises again on hot evenings.",
      "What might cause the number of passengers on a bus to rise and fall during the day?",
    ],
    [
      "Fruit at the market",
      "Fruit prices sometimes rise when supplies run low and fall again when deliveries arrive. The prices can ____ from week to week.",
      "Describe something you track that changes irregularly over time.",
    ],
  ],
  substantiate: [
    [
      "A claim about the library",
      "The prefect says the library is more crowded on Fridays. She brings attendance records to ____ her claim.",
      "What information could you use to support a claim that students need more homework help?",
    ],
    [
      "A repair request",
      "A cyclist reports that a path floods after heavy rain. He sends photos taken on several dates to ____ the report.",
      "What details could back up a request for a safer crossing near your school?",
    ],
  ],
  infer: [
    [
      "The empty hall",
      "The lights are off and chairs are stacked neatly. From those clues, the caretaker might ____ that the meeting has ended.",
      "What could a teacher conclude from seeing several students get stuck on the same step?",
    ],
    [
      "The worn shortcut",
      "There is a worn strip of grass between the gate and the bus stop. A planner might ____ that people often use it as a shortcut.",
      "Describe a conclusion you could draw from clues you notice in your neighbourhood.",
    ],
  ],
  articulate: [
    [
      "A club discussion",
      "Nina knows why the new timetable bothers her. She writes down one example so she can ____ her concern clearly at the meeting.",
      "How would you put a concern about a school activity into clear words?",
    ],
    [
      "Explaining a choice",
      "Two teammates prefer different designs. Their coach asks each of them to ____ what they value most and why.",
      "How could you explain a personal preference so someone with a different view can understand it?",
    ],
  ],
  feasible: [
    [
      "A weekend cleanup",
      "Five people are free on Saturday. Cleaning one block is ____ with that group and a morning of work.",
      "How could you shrink a big project so that your group could finish it this week?",
    ],
    [
      "Recording a play",
      "The class has a phone and a quiet room. They decide that recording one scene before lunch is ____.",
      "Describe a goal your group can achieve using the time and equipment you already have.",
    ],
  ],
  mitigate: [
    [
      "A slippery entrance",
      "Rainwater makes the entrance slippery. The caretaker puts down mats to ____ the risk of people falling.",
      "What could organisers do to reduce the impact of heat at an outdoor event?",
    ],
    [
      "A noisy renovation",
      "The library schedules drilling in the morning to ____ the disruption for students who study there after school.",
      "How could you lessen the effect of a late delivery on a group project?",
    ],
  ],
  allocate: [
    [
      "Planning a presentation",
      "The team has twenty minutes to present. They ____ five minutes for audience questions.",
      "How would you divide the time available in a short group meeting?",
    ],
    [
      "Buying supplies",
      "The art club agrees to ____ part of its budget to replacement brushes for the next workshop.",
      "How would you set aside money for supplies when planning a small event?",
    ],
  ],
  ergonomics: [
    [
      "The clinic desk",
      "Staff strain to reach their monitors. A review of the desk’s ____ looks at screen height, reach and posture.",
      "What would you change about a workstation to make it easier on the body?",
    ],
    [
      "A new game controller",
      "Testers judge the controller’s ____ by how comfortably people with different hand sizes can reach the buttons.",
      "How would you evaluate the design of something people have to hold for an hour?",
    ],
  ],
  reproducibility: [
    [
      "The second lab",
      "Another lab follows the same instructions and gets a similar result. That helps establish the ____ of the finding.",
      "Why might you ask another class to repeat your experiment?",
    ],
    [
      "Testing a new study method",
      "A second school follows the same study plan and checks whether its students improve by a similar amount. This checks the ____ of the first result.",
      "Describe a finding you would trust more if an independent group got a similar result.",
    ],
  ],
  "confounding factor": [
    [
      "Two running routes",
      "One group runs at dawn and the other runs at midday. If the midday group gets tired sooner, heat could be a ____ when comparing the routes.",
      "What outside influence might make a comparison between two classroom activities unfair?",
    ],
    [
      "A new study app",
      "Only the students using the app also get extra tutoring. The tutoring is a possible ____ when comparing their test scores with those of other students.",
      "What would you keep the same when testing which of two recipes is easier to make?",
    ],
  ],
  corroborate: [
    [
      "The missing delivery",
      "A shopkeeper says the parcel arrived at noon. A courier’s scan could ____ that account.",
      "What independent source would you check to confirm a claim about a cancelled event?",
    ],
    [
      "How noisy is the hall?",
      "The class reports that the hall is louder after lunch. Measurements from another group could ____ their observations.",
      "How could you check whether two reports about an event agree?",
    ],
  ],
  extrapolate: [
    [
      "The first week of sales",
      "A stall sells well in its first week. The owner wants to ____ from that week to estimate sales for the whole month.",
      "What could make an estimate based on one unusually busy week misleading?",
    ],
    [
      "A climbing plant",
      "Over four weeks, the plant grows about a centimetre a week. Sam wants to ____ from that rate to predict its height next month.",
      "Give an example of a prediction you could make by extending a pattern you observed.",
    ],
  ],
  generalisability: [
    [
      "A morning survey",
      "Only morning commuters answered the survey. That limits the ____ of its results to evening passengers.",
      "Who else would you include before drawing a conclusion about all students?",
    ],
    [
      "One classroom trial",
      "A teaching method worked in a small class. The researchers tested it in larger classes to check the ____ of that result.",
      "When might something that worked in one group apply poorly to another?",
    ],
  ],
  counterproductive: [
    [
      "The extra reminders",
      "A team sends hourly reminders to keep people informed. People start muting the chat, so the reminders become ____.",
      "When might a rule meant to save time end up wasting it?",
    ],
    [
      "Quiet study",
      "A strict silence rule makes students leave a study room whenever they need help. If the aim is to help them learn, the rule may be ____.",
      "Describe a change meant to encourage a habit that might have the opposite effect.",
    ],
  ],
  disproportionate: [
    [
      "A library penalty",
      "A student returns a book one day late and loses borrowing rights for a month. The teacher considers the punishment ____ to the mistake.",
      "When might the impact of a rule be much larger for one group than another?",
    ],
    [
      "A small project",
      "One team member handled nearly every task despite the group sharing credit equally. She carried a ____ share of the work.",
      "Describe a situation where the effort required seems out of proportion to the benefit.",
    ],
  ],
  disincentivise: [
    [
      "Reporting a problem",
      "Volunteers have to fill in a long form every time a tool breaks. The extra work could ____ them from reporting minor faults.",
      "What part of a school process might make people less willing to participate?",
    ],
    [
      "The bus transfer",
      "A second fare could ____ passengers from switching buses halfway through their trip.",
      "How might a new fee change what people choose to do?",
    ],
  ],
  "on the face of it": [
    [
      "The cheaper printer",
      "____, the cheaper printer looks like the better deal. Then Mei checks how much replacement ink costs.",
      "Describe a choice that looked straightforward until you checked one detail.",
    ],
    [
      "The quick survey",
      "____, a high turnout suggests the survey captured many views. Almost everyone who replied belongs to the same club.",
      "Think of a result whose meaning might change once you find out who took part.",
    ],
  ],
  "with one caveat": [
    [
      "A new practice time",
      "I support moving rehearsals to Friday, ____: we need to check who can still get home afterward.",
      "Agree to a change at school and state one condition you would attach to it.",
    ],
    [
      "Sharing the summary",
      "The tutor recommends sharing the summary, ____: readers should also have access to the original report.",
      "Describe a recommendation that comes with an important condition.",
    ],
  ],
  "in and of itself": [
    [
      "A popular study app",
      "Many downloads, ____, reveal very little about whether people kept using the app.",
      "What can an attendance number alone tell you about how much people learned?",
    ],
    [
      "Choosing a teammate",
      "A high score, ____, says little about whether someone enjoys working in a group.",
      "Name one piece of information that would be misleading if you used it alone.",
    ],
  ],
  "all things being equal": [
    [
      "The two suppliers",
      "____, the club would choose the cheaper quote. First it checks that both suppliers can deliver on time.",
      "Compare two places to meet and make a choice assuming travel time and cost are the same.",
    ],
    [
      "Picking a practice room",
      "____, the choir prefers the larger room. It will check availability and noise before booking.",
      "Compare two options for a group activity and state what you would hold equal.",
    ],
  ],
  "by the same token": [
    [
      "Posting the timetable",
      "Publishing the timetable early gives performers time to prepare. ____, it gives volunteers time to plan their shifts.",
      "Give two benefits that follow from the same decision.",
    ],
    [
      "Keeping the path open",
      "Keeping the path clear gives wheelchair users room to pass. ____, it gives people with pushchairs room to pass.",
      "Explain how one change could help two groups for the same reason.",
    ],
  ],
  "bear out": [
    [
      "The express bus",
      "The transport team expects the new service to save time. They will see whether passengers’ journey logs ____ that prediction.",
      "What results would show whether a new timetable did what people expected?",
    ],
    [
      "A quieter lunch hall",
      "Staff say the new layout makes the room quieter. The school will check whether the sound readings ____ that claim.",
      "Name a claim about your school and suggest what could confirm it.",
    ],
  ],
};

export function vocabularyExercise(word, reviews = 0) {
  const options = contexts[word];
  if (!options) return null;
  const [title, passage, prompt] = options[reviews % options.length];
  return { title, passage, prompt, example: passage.replace("____", word) };
}
