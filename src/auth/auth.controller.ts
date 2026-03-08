import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto";
import { SignInDto } from "./dto/sign-in.dto";
import { JwtGuard } from "./guard";
import { GetUser } from "./decorator";

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
     constructor(private authService: AuthService){}

     @ApiOperation({ summary: 'Register a new user' })
     @Post('register')
     async register(@Body() dto: RegisterDto){
        return this.authService.register(dto);
     }

     @ApiOperation({ summary: 'Login with email and password' })
     @Post('login')
     async login(@Body() dto: SignInDto){
        return this.authService.login(dto);
     }

     //requires an active session — the admin secret is sent here, not at registration,
     //so it is never part of the standard public sign-up flow
     @ApiOperation({ summary: 'Promote yourself to admin using the admin secret' })
     @UseGuards(JwtGuard)
     @Post('promote-to-admin')
     async promoteToAdmin(
        @GetUser('id') userId: number,
        @Body('adminSecret') adminSecret: string){
        return this.authService.promoteToAdmin(userId, adminSecret);
     }

     //no JWT guard here — the whole point of this endpoint is to be called
     //when the access token has already expired. the refresh token itself
     //is used to identify and authenticate the user
     @ApiOperation({ summary: 'Get a new access token using a refresh token' })
     @Post('refresh')
     async refresh(@Body('refreshToken') refreshToken: string){
        return this.authService.refreshAccessToken(refreshToken);
     }

     @ApiOperation({ summary: 'Logout and invalidate the refresh token' })
     @UseGuards(JwtGuard)
     @Post('logout')
     async logout(@GetUser('id') userId: number){
        return this.authService.logout(userId);
     }
}
