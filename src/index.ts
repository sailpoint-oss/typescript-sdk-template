import { SailPoint, Configuration, Paginator } from "sailpoint-api-client"
import { Search } from "sailpoint-api-client/dist/access_model_metadata/api"

const getTransforms = async () => {
    // Initialize configuration; this requests a token using your configured credentials
    let apiConfig = new Configuration()
    // Initialize the TransformsApi
    let api = new SailPoint.TransformsApi(apiConfig)
    // Call out to your tenant to get the list of transforms
    let transforms = await api.listTransformsV1()
    console.log(transforms)
}

const getAccounts = async () => {
    let apiConfig = new Configuration()
    let api = new SailPoint.AccountsApi(apiConfig)

    const val = await Paginator.paginate(api, api.listAccountsV1, { limit: 20 }, 10)
    console.log(val.data)
}

const searchIdentities = async () => {
    let apiConfig = new Configuration()
    let api = new SailPoint.SearchApi(apiConfig)

    const search: Search = {
        indices: ["identities"],
        query: { query: "*" },
        sort: ["-name"]
    }
    const val = await Paginator.paginateSearchApi(api, search, 250, 1000)
    console.log(val.data.length)
}

getTransforms()
