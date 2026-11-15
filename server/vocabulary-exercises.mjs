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
};

export function vocabularyExercise(word, reviews = 0) {
  const options = contexts[word];
  if (!options) return null;
  const [title, passage, prompt] = options[reviews % options.length];
  return { title, passage, prompt, example: passage.replace("____", word) };
}
