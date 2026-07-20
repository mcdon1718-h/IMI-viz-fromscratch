for year in 2019 2020 2021 2022 2023 2024; do
  for f in "/n/holylfs05/LABS/jacob_lab/shancock/colombia_trends/paper_figures/web_bundle_full/data/grid/annual/$year"/*_posterior_uncertainty.json; do
    cp "$f" "/n/home03/mcdonh/columbia_gridded_unc/$(basename "${f%.json}")_${year}.json"
  done
done
