import { response } from "express"
import {asyncHandler} from  "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.models.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
const registerUser = asyncHandler(async (req, res)=>{
    //details - user se leni pdegi
    //validation - not empty
    //check if already exists : username or email
    //avatar 
    //uplaod them to cloudinary: url, check  avatar
    //create user object - create entry in db
    //remove password and refresh token feild
    //check for user creation
    //successful message- return response

    const{username, fullName, email, password }=req.body
    // if(fullName===""){
    //     throw new ApiError(400, "fullname is required")
    // }
    if(
        [fullName,email,username,password].some((field)=> 
            field?.trim()==="")
    ){
        throw new ApiError(400, "All fields are required")
    }
    //check if user already exists
    const existedUser = await User.findOne({
        $or:[{username},{email}]
    })
    if(existedUser){
        throw new ApiError(409, "User already exists")
    }
    // console.log("req.files: ",req.files);
    const avatarLocalPath =  req.files?.avatar[0]?.path
    // const coverImageLocalPath = req.files?.coverImage[0]?.path
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0){
        coverImageLocalPath = req.files.coverImage[0].path
    }
    
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is required")
    }
    //upload to cloudinary
    const avatarUrl = await uploadOnCloudinary(avatarLocalPath)
    const coverImageUrl = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatarUrl){
        throw new ApiError(400, "Avatar upload failed")
    }
    //create user object
    const user = await User.create(
        {
            username: username.toLowerCase(),
            avatar : avatarUrl.url,
            coverImage : coverImageUrl?.url || " ",
            fullName,
            email,
            password
        }
    )

    const usercheck = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if(!usercheck){
        throw new ApiError(500, "Something went wrong while registering user")
    }
    return res.status(201).json(
        new ApiResponse(200,usercheck, "User created Successfully")
    )

    
})

export {registerUser}