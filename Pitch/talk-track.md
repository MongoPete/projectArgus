# **MDBA Demo Talk Track**

### **5-minute pitch · 8 slides**



---



## **Slide 1 — Dashboard / At a Glance**

*[Start tour, land on the dashboard stats]*

"So this is what your team sees when they open Atlas in the morning. Not a wall of metrics — just the stuff that actually matters.

Three numbers up front: open findings that need to be reviewed, estimated savings per month, and clusters being actively watched by agents.

Before anyone's had their first cup of coffee, they already know where to look."



---



## **Slide 2 — Findings List**

*[Click Next → Findings page]*

"And this is where it gets tangible. Every agent finding is ranked by what it's actually costing you — dollar amount, right there in the row.

You might see something around data transfer costs, or over-snapshotting across clusters. These aren't vague warnings. Each one is tied to a cost figure with a reason behind it."



---



## **Slide 3 — Finding Detail**

*[Tour auto-drills into the top finding]*

"So if we clicked on the first findings to review , we can see what the agent actually found

It traced the spike back to a specific server, reported the cost jump week over week, identified which collections were responsible, and connected it all back to a new pipeline that was added.

At the bottom you get the dollar amount you could get back — monthly and annualized. And below that is the full analysis trace — every step the agent took to get there. Billing API, line items, $collStats, three specific fixes with dollar estimates for each.

This isn't a report someone wrote. The agent did this."



---



## **Slide 4 — Human in the Loop**

*[Spotlight on YOUR CALL section]*

"The agent never acts on its own.

When you're ready to do something about a finding, you get this screen. Three options, your choice — apply the optimization, review it directly in Atlas, or dismiss it entirely.

If you hit Apply, it shows you the exact command and the target cluster. You confirm it, or you don't. Nothing happens without you.

That's not a limitation — that's the design."



---



## **Slide 5 — Workflows**

*[Navigate to Workflows page]*

"So where did that finding come from? This is Workflows — your always-on agents.

Some examples of past workflows that was created:

Cost and query health on prod.

 Security and data quality on the fintech tier. 

Backups and indexes across everything else. Each one running continuously, watching a different dimension of your clusters.

So what if you wanted to add your own? That's where it gets interesting."



---



## **Slide 6 — Three Ways to Build**

*[Navigate to New Workflow / mode selector]*

"You've got three ways to create a workflow, depending on who's doing it.

Out of the box, templates cover everything people actually care about — costs, query speed, backups, security. One click and it's running.

Then there's a chat interface — describe what you want to monitor in plain English and it builds the pipeline for you. And for the folks who want full control, there's a visual flow editor where you wire it all up yourself.

Same outcome, three different ways to reach the solution."



---



## **Slide 7 — Chat Path**

*[Auto-triggers the first suggested prompt]*

"Here's what the chat path looks like in practice. One sentence — the system figures out the category, drafts a workflow, and hands it back ready to deploy. Take it as-is, tweak the steps, or open it in the full editor.

And those suggested prompts? Slow query checks, backup cost reviews, snapshotting audits. These are conversations customers are already having with their SAs and CSMs every week. Now they can just type it."



---



## **Slide 8 — Flow Editor**

*[Navigate to Flow Editor, full workspace visible]*

"And for the power users — this is the flow editor. Visual DAG, node by node.

The pipeline pulls invoices, gets the line items, computes the delta, and fires a Slack notification if spend exceeds the threshold. Each node wired together, memory on at every step so the agent carries context through the whole run.

On the left, a component palette — drag and drop. On the right, the terminal showing actual execution in real time. Every condition evaluated, every step traced.

You built it. You can see exactly what it's doing."



---



## **Closing**

"So that's MDBA.

Every morning, your team knows exactly what's wrong, what it's costing, and what to do about it — before anyone has to go digging.

The agent does the analysis. You make the call. And whether your team wants to click a template, describe it in plain English, or wire it up node by node — it meets them where they are.

That's what proactive database management looks like when it's actually built for the people who have to act on it."



---



*Open to questions or dive deeper on any step.*

  
