import { Step } from "../types";

export const DEFAULT_STEPS_US: Step[] = [
  {
    id: "check_registration",
    title: "Verify Registration Status",
    description: "Confirm you are officially registered to vote in your current district. Check for any required address updates.",
    status: "pending",
    dueDate: "2026-10-15",
    order: 0
  },
  {
    id: "voter_id",
    title: "Prepare Required Identification",
    description: "Ensure you have a valid Photo ID (Driver's License, Passport, etc.) that meets your state's strict requirements.",
    status: "pending",
    order: 1
  },
  {
    id: "mail_ballot",
    title: "Request Mail-in Ballot (Optional)",
    description: "If you prefer voting from home, apply for your absentee ballot before the request window closes.",
    status: "pending",
    dueDate: "2026-10-26",
    order: 2
  },
  {
    id: "polling_location",
    title: "Locate Your Polling Station",
    description: "Find your assigned precinct and check for any location changes since the last election.",
    status: "pending",
    order: 3
  },
  {
    id: "sample_ballot",
    title: "Review Sample Ballot",
    description: "Study candidates and local measures in advance to make informed decisions at the booth.",
    status: "pending",
    order: 4
  },
  {
    id: "election_day",
    title: "Cast Your Vote",
    description: "Head to the polls on November 3! Remember to bring your ID and follow all polling station guidelines.",
    status: "pending",
    dueDate: "2026-11-03",
    order: 5
  },
  {
    id: "confirm_vote",
    title: "Confirm Vote Cast",
    description: "Mark your voting mission as accomplished! Share your participation status to inspire others.",
    status: "pending",
    dueDate: "2026-11-04",
    order: 6
  }
];

export const DEFAULT_STEPS_IN: Step[] = [
  {
    id: "epic_check",
    title: "Check Elector Search (EPIC)",
    description: "Search for your name in the electoral roll via voterportal.eci.gov.in using your EPIC number.",
    status: "pending",
    dueDate: "2026-04-10",
    order: 0
  },
  {
    id: "voter_id_in",
    title: "Verify Voter ID Card",
    description: "Ensure you have your physical EPIC card. If lost, apply for a replacement via Form 001 immediately.",
    status: "pending",
    order: 1
  },
  {
    id: "booth_location",
    title: "Find Your Polling Booth",
    description: "Locate your assigned polling station (Booths are usually within 2km of your residence).",
    status: "pending",
    order: 2
  },
  {
    id: "voter_slip",
    title: "Collect Voter Information Slip",
    description: "The BLO will usually distribute these at your doorstep 3-5 days before the poll.",
    status: "pending",
    order: 3
  },
  {
    id: "polling_day_in",
    title: "Cast Your Vote (EVM/VVPAT)",
    description: "Verify your candidate choice on the VVPAT paper trail after pressing the blue button on the EVM.",
    status: "pending",
    dueDate: "2026-05-14",
    order: 4
  },
  {
    id: "confirm_vote_in",
    title: "Confirm Vote Cast",
    description: "Successfully cast your vote? Confirm here and show your inked finger digitally!",
    status: "pending",
    dueDate: "2026-05-15",
    order: 5
  }
];
