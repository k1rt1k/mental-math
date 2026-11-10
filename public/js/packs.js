// Real-life packs: themed sets of Real-life question patterns, practised together. Pure data; the screen is in views/learn.js.
// A pack is not a new skill: its answers feed the one Real-life rating, and its patterns keep their own accuracy and speed stats.
export const PACKS = [
  { id: 'disc', title: 'Discounts and deals', blurb: 'What you pay, what you save, what percent off, and what it cost before the sale.',
    pats: ['sale price', 'discount amount', 'percent off', 'original price', 'successive discounts', 'unit price'], tricks: ['lifes', 'lifed', 'lifeo', 'lifeor'] },
  { id: 'tax', title: 'Tax and GST', blurb: 'Add GST or sales tax to a price, and take it back out of a bill that already includes it.',
    pats: ['add tax', 'add GST', 'GST amount', 'GST in the price'], tricks: ['lifeg', 'lifeb'] },
  { id: 'tips', title: 'Tips', blurb: 'Work out the tip fast and the total to pay, from 10%.',
    pats: ['friendly tip', 'awkward tip', 'total with tip'], tricks: ['lifet', 'lifett'] },
  { id: 'units', title: 'Unit conversion', blurb: 'Metric, feet and pounds, days and seconds, and Celsius to Fahrenheit.',
    pats: ['unit conversion', 'temperature'], tricks: ['lifeu', 'lifetemp'] },
  { id: 'split', title: 'Splitting bills', blurb: 'Share a bill evenly, with the tip or the GST added first.',
    pats: ['split the bill', 'split with tip', 'split with GST'], tricks: ['lifesp'] },
  { id: 'time', title: 'Time and schedules', blurb: 'Gaps between clock times, adding durations, days between dates, and what a few hours of work pays.',
    pats: ['clock time', 'duration sum', 'days between', 'hourly pay'], tricks: ['lifec', 'lifedu', 'lifeday', 'lifew'] },
  { id: 'travel', title: 'Travel and fuel', blurb: 'Distance, speed and time for a trip, and how much fuel and money it takes.',
    pats: ['speed', 'distance', 'travel time', 'fuel used', 'fuel cost'], tricks: ['lifedi', 'lifefu'] },
  { id: 'shop', title: 'Shopping best-buy', blurb: 'Price per 100, which pack costs less per item, buy-some-get-some-free, and what a bundle saves.',
    pats: ['unit price', 'price per 100', 'price gap', 'free items', 'bundle saving'], tricks: ['lifeh', 'lifefr'] },
  { id: 'money', title: 'Money and growth', blurb: 'Salary hikes, percent change, simple and compound interest, the rule of 72 and saving towards a goal.',
    pats: ['salary hike', 'percent change', 'simple interest', 'compound interest', 'rule of 72', 'months to save'], tricks: ['lifesi', 'lifepc', 'lifer72'] },
  { id: 'cricket', title: 'Cricket and sports', blurb: 'Run rate, the rate you still need, strike rate, batting average and balls in overs.',
    pats: ['run rate', 'required rate', 'strike rate', 'batting average', 'balls in overs'], tricks: ['lifecr', 'lifess', 'lifebl'] },
  { id: 'budget', title: 'Budget and salary', blurb: 'Monthly and yearly pay, a daily budget, the 50-30-20 rule, shared rent and take-home pay.',
    pats: ['monthly and yearly', 'daily budget', 'budget rule', 'shared rent', 'take-home'], tricks: ['lifeyr', 'lifebr'] },
];
export const packOf = (id) => PACKS.find((p) => p.id == id);
