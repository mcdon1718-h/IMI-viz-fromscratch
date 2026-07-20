import xarray as xr
import matplotlib as plt

def get_posterior_emissions(prior, scale, species, OptimizeSoil=False):
    """
    Function to calculate the posterior emissions from the prior
    and the scale factors. Properly accounting for no optimization
    of the soil sink.
    Args:
        prior  : xarray dataset
            prior emissions
        scales : xarray dataset or datarray of scale factors
    Returns:
        posterior : xarray dataset
            posterior emissions
    """
    # Make copies to avoid modifying the original data
    prior = prior.copy()
    scale = scale.copy()

    # keep attributes of data even when arithmetic operations applied
    xr.set_options(keep_attrs=True)

    # if xarray datarray
    if isinstance(scale, xr.DataArray):
        scale_factors = scale
    # if xarray dataset
    elif isinstance(scale, xr.Dataset):
        scale_factors = scale["ScaleFactor"]
    else:
        raise ValueError("Scale factors must be an xarray DataArray or Dataset")

    posterior = prior.copy()
    if not OptimizeSoil:
        # we do not optimize soil absorbtion in the inversion. This
        # means that we need to keep the soil sink constant and properly
        # account for it in the posterior emissions calculation.
        # To do this, we:
        # make a copy of the original soil sink
        prior_soil_sink = prior[f"Emis{species}_SoilAbsorb"].copy()

        filtered_keys = [
            key
            for key in prior.keys()
            if "EmisCH4" in key
            and key != "EmisCH4_Total"
            and key != "EmisCH4_SoilAbsorb"
        ]
        # scale the prior emissions for all sectors except soil using the scale factors
        for ds_var in filtered_keys:
            posterior[ds_var] = prior[ds_var] * scale_factors

        # But reset the soil sink to the original value
        posterior[f"Emis{species}_SoilAbsorb"] = prior_soil_sink

        # Add the original soil sink back to the total emissions
        posterior[f"Emis{species}_Total"] = (
            posterior[f"Emis{species}_Total_ExclSoilAbs"]
            + posterior[f"Emis{species}_SoilAbsorb"]
        )
    else:
        filtered_keys = [key for key in prior.keys() if "EmisCH4" in key]
        # scale the prior emissions for all sectors using the scale factors
        for ds_var in filtered_keys:
            posterior[ds_var] = prior[ds_var] * scale_factors

    return posterior


if __name__ == "__main__":
    # loop through the years and calculate the min and max emissions 
    # across the ensemble for each grid cell, then save to netcdf
    for year in range(2019, 2025):
        inv_res_ln = xr.load_dataset(f"/n/holylfs06/LABS/jacob_imi_lab/Users/lestrada/multi_year_CONUS/imi_output/CONUS{year}_lognormal_2600_elements/inversion/gridded_posterior_ln_ensemble.nc")
        inv_res = xr.load_dataset(f"/n/holylfs06/LABS/jacob_imi_lab/Users/lestrada/multi_year_CONUS/imi_output/CONUS{year}_normal_2600_elements/inversion/gridded_posterior_ensemble.nc")
        prior_ds = xr.load_dataset(f"/n/holylfs06/LABS/jacob_imi_lab/Users/lestrada/multi_year_CONUS/integrated_methane_inversion/custom/analysis/national/emissions/prior_{year}.nc")

        sfs = inv_res["ScaleFactor"]
        post_ds = get_posterior_emissions(prior_ds, inv_res["ScaleFactor"], "CH4", OptimizeSoil=False)
        post_ds_ln = get_posterior_emissions(prior_ds, inv_res_ln["ScaleFactor"], "CH4", OptimizeSoil=False)

        # get the min and max emissions across the ensemble for each grid cell
        post_ds_min = post_ds.min(dim="ensemble")
        post_ds_ln_min = post_ds_ln.min(dim="ensemble")
        post_ds_max = post_ds.max(dim="ensemble")
        post_ds_ln_max = post_ds_ln.max(dim="ensemble")

        # concatenate the ln min and normal min along a new dimension called "distribution"
        post_ds_min_concat = xr.concat([post_ds_min, post_ds_ln_min], dim="distribution")
        post_ds_min_concat["distribution"] = ["normal", "lognormal"]
        post_ds_max_concat = xr.concat([post_ds_max, post_ds_ln_max], dim="distribution")
        post_ds_max_concat["distribution"] = ["normal", "lognormal"]

        # take the min and max across the distribution dimension to get the overall min and max across both distributions
        overall_post_min = post_ds_min_concat.min(dim="distribution")
        overall_post_max = post_ds_max_concat.max(dim="distribution")

        overall_post_max.to_netcdf(f"post_minmax/posterior_ens_max_{year}.nc")
        overall_post_min.to_netcdf(f"post_minmax/posterior_ens_min_{year}.nc")