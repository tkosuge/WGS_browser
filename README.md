<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

The alpha-version in AI Studio: https://ai.studio/apps/7a1e29d6-ecc5-47c7-a3fd-1345278bf98f

# Prerequisites
- Node.js
- python3.12 or above with the following modules
  - pandas
  - bio
  - ete3
  - schedule
  - legacy-cgi (for >python3.13)


## Installation
1. `git clone https://github.com/tkosuge/WGS_browser.git`
2. `cd WGS_browser`
3. `npm install`
4. `python3 getlist.py`
   The script keeps running and does not return to the prompt until pressing ctrl+c. The script periodically (every ~3 hours each day) updates the folloing text and sqlite files. WGS_ORGANISM_LIST.txt, taxdump.tar.gz, WGS_ORGANISM_LIST_with_Taxonomy.tsv, ncbitaxonomy.sqlite, and ncbitaxonomy.sqlite.traverse.pkl are created.

## Start the app
For dev mode:
   `npm run dev`

For production mode:
   `npm run build`
   `npm start`

Open http://localhost:23000/wgs in the browser.
