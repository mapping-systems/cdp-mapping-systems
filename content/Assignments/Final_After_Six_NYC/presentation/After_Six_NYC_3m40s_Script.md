# AFTER / SIX NYC - Final Presentation Script

**Target:** about 3 minutes 40 seconds  
**Delivery:** calm conversational pace; pause briefly at each slide change

## Slide 1 - Introduction (0:00-0:35)

Hi everyone. This is my sixth year in New York, and I love visiting galleries, museums, and independent cinemas. But when class ends, or a friend gets off work, we still ask: where can we actually go right now?

That everyday problem became **After/Six NYC**. It asks not only what is nearby, but what is realistically reachable after six. I developed it by expanding the Networks exercise into a public cultural-access tool.

## Slide 2 - Research Question (0:35-1:05)

My research statement is: **near is not the same as accessible**.

Euclidean distance measures direct separation, shown by the red line. But the blue route represents the actual network journey: walking to a station, waiting, riding, transferring, and walking again. In this example, Columbia to MoMA becomes a modeled 33-minute trip.

Access also depends on time, cost, mobility needs, and interest.

## Slide 3 - Method (1:05-1:58)

The project has three stages: input, model, and output.

The inputs are 161 screened cultural places, 106 weekly schedules, 16 current programs, and static MTA G-T-F-S data.

I built a schedule-weighted graph with 1,002 station-line nodes and 4,337 weighted edges. Combining each station and line into a node makes transfers measurable decisions.

For each venue, the model tests up to eight nearby stations. It combines walking, waiting, riding, transfers, and exit time, then scores the options by travel time, hours, cost, accessibility, and interest.

The output ranks venues and shows a route, travel time, arrival time, and whether each will still be open. This models a typical weekday, not live MTA service.

## Slide 4 - Interactive Product (1:58-2:34)

The interface lets each person change the question. Users enter any New York City origin, choose a departure time, and filter for places open at arrival. Every destination gets its own estimated arrival time.

A personal profile adjusts rankings through interests, budget, trip limit, discounts, and mobility priorities. Selecting a venue reveals its route, travel time, arrival, admission, hours, and official link, supporting an actual decision.

## Slide 5 - Supporting Features (2:34-3:03)

Three supporting views extend the tool. **On Now** presents date-checked programs. **Saved** creates a shortlist. **Profile** stores preferences that change recommendations.

For this prototype, saved places and profile data stay in the browser, so no login is required. This also demonstrates how a future account system could work.

## Slide 6 - Reflection (3:03-3:40)

My main conclusion is that access is a relationship between a person, a place, a time, and a network. The same venue can be accessible to one person tonight and inaccessible to someone else, or even to the same person at a different time.

The prototype has clear limits: no live delays, elevator outages, sold-out events, or automated program updates. Next, I would connect live transit feeds, expand event data, test with users, and compare barriers across neighborhoods.

So this project turns network analysis into a practical question: after the day ends, what culture is actually within reach? Thank you.
