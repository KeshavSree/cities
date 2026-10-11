export interface ContributionDay { date:string; contributionCount:number }
export interface ContributionCalendar { totalContributions:number; weeks:{contributionDays:ContributionDay[]}[] }
