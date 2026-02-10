import { Configuration, TransformsApi } from "sailpoint-api-client"

const getTransforms = async () => {
    // Initialize configuration; this requests a token using your configured credentials
    let apiConfig = new Configuration()
    // Initialize the TransformsApi
    let api = new TransformsApi(apiConfig)
    // Call out to your tenant to get the list of transforms
    let transforms = await api.listTransforms()
    console.log(transforms)
}

getTransforms()
