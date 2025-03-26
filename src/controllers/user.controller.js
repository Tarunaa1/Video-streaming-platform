import { response } from "express"
import {asyncHandler} from  "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.models.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken";
import req from "express/lib/request.js"

const generateAccessAndRefreshTokens = async(userId)=>{
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false});
        return {accessToken, refreshToken};

    } catch (error) {
        throw new ApiError(500,"Something went wrong while generating tokens");
    }
}

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

const loginUser = asyncHandler(async (req,res)=>{
    // req body se data 
    // username or email
    // find the user
    // pass check 
    // access and refresh token
    //send cookie 
    const {email, username, password} = req.body; 
    if(!username && !email){
        throw new ApiError(400, "Username or email required!");
    }
    //find user by email or username
    const user = await User.findOne({$or:[{email},{username}]})
    if(!user){
        throw new ApiError(404, "User does not exist");
    }
    //password check
    const isValidPassword = await user.isPasswordCorrect(password);
    if(!isValidPassword){
        throw new ApiError(401,"Invalid Password");
    }
    //access token and refresh token
    const {accessToken, refreshToken}=await generateAccessAndRefreshTokens(user._id);
    //send cookie
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
    const options = {
        httpOnly: true,
        secure : true
    }
    return res.status(200).
    cookie("accessToken", accessToken, options).
    cookie("refreshToken", refreshToken, options).
    json(
        new ApiResponse(200,{user: loggedInUser, accessToken, refreshToken}, "User logged in successfully")
    )
} )

const logoutUser = asyncHandler(async(req,res)=>{
    //remove refresh token from user
    await User.findByIdAndUpdate(req.user._id,
        {
            $set:{
            refreshToken:undefined
        }},
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure : true
    }
    return res.status(200).clearCookie("accessToken", options).clearCookie("refreshToken",options).json(new ApiResponse(200, {}, "User Logged Out"))
    
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
    //get refresh token from cookie
    const incomingrefreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if(!incomingrefreshToken){
        throw new ApiError(401, "Refresh Token is missing");
    }
    //verify refresh token
    try {
        const decodedToken = jwt.verify(incomingrefreshToken, process.env.REFRESH_TOKEN_SECRET);
        //check if user exists
        const user = await User.findById(decodedToken?._id)
         
        if(!user){
            throw new ApiError(401, "Invalid refresh token");
        }
        if(incomingrefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Invalid refresh token");
        }
    
        const options = {
            httpOnly: true,
            secure : true
        }
        const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res.status(200).cookie("accessToken", accessToken,options).cookie("refreshToken", refreshToken, options).json(
            new ApiResponse(200, {accessToken, refreshToken},
                "Access Token and Refresh Token generated successfully")
            
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler(async (req, res)=>{
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
    if(!isPasswordCorrect){
        throw new ApiError(400, "Old password is incorrect")
    }
    user.password = newPassword
    await user.save({validateBeforeSave: false})
    return res.status(200).json(new ApiResponse(200, {}, "Password changed successfully"))

})

const getCurrentUser = asyncHandler(async (req,res)=>{
    return res.status(200).json(new ApiResponse(200, req.user, "Current user fetched successfully"))
})

const updateAccountDetails = asyncHandler(async (req,res)=>{
    const {fullName, email} = req.body
    if(!fullName || !email){
        throw new ApiError(400, "Please provide all fields")
    }
    const user = await User.findByIdAndUpdate(req.user?._id, {
        $set :{
            fullName, email
        }
    }, {new: true}).select("-password")

    return res.status(200).json(new ApiResponse(200, user, "Account details updated successfully"))
})

const updateUserAvatar = asyncHandler(async (req,res)=>{
    const avatarLocalPath = req.file?.path
    if(!avatarLocalPath){
        throw new ApiError(400, "Please provide an avatar")
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if(!avatar.url){
        throw new ApiError(400, "Failed to upload avatar")
    }
    const user = await User.findByIdAndUpdate(req.user?._id, {
        $set :{
            avatar: avatar.url
        }
    },{new: true}).select("-password")

    return res.status(200).json(new ApiResponse(200, user, "Avatar updated successfully" ))

})

const updateUserCoverImage= asyncHandler(async (req,res)=>{
    const coverImageLocalPath = req.file?.path
    if(!coverImageLocalPath){
        throw new ApiError(400, "Please provide a cover Image")
    }
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if(!coverImage.url){
        throw new ApiError(400, "Failed to upload coverImage")
    }
    const user = await User.findByIdAndUpdate(req.user?._id, {
        $set :{
            coverImage: coverImage.url
        }
    },{new: true}).select("-password")

    return res.status(200).json(new ApiResponse(200, user, "Cover image updated successfully" ))
})

export {registerUser, loginUser, logoutUser,refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage}