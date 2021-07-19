import React, {useState} from 'react';
import {Button} from '@blueprintjs/core';
import {FullscreenButton} from "../common/FullscreenButton";
import {SubtitlesPopup} from "../subtitles/SubtitlesPopup";
import {useAppSelector} from "../hooks";
import {faQuestion} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";

interface MenuIconsTaskProps {
    toggleMenu: () => void,
    toggleDocumentation: () => void,
}

export function MenuIconsTask(props: MenuIconsTaskProps) {
    const getMessage = useAppSelector(state => state.getMessage);
    const [subtitlesOpen, setSubtitlesOpen] = useState(false);
    const subtitles = useAppSelector(state => state.subtitles);
    const playerData = useAppSelector(state => state.player.data);
    const showSubtitles = !subtitles.editing && playerData && playerData.subtitles && !!playerData.subtitles.length;

    return (
        <div id='menu'>
            <div className="menu-task-elements">
                <div className="menu-task-element is-blue">
                    <FullscreenButton />
                </div>
                {showSubtitles &&
                    <div className="menu-task-element">
                      <Button
                        onClick={() => setSubtitlesOpen(!subtitlesOpen)}
                        className='btn-cc'
                        title={getMessage('CLOSED_CAPTIONS_TOOLTIP').s}
                        text='CC'
                      />
                      <SubtitlesPopup open={subtitlesOpen} onClose={() => setSubtitlesOpen(false)}/>
                    </div>
                }
                <div className="menu-task-element is-blue">
                    <Button onClick={props.toggleDocumentation} icon='help'/>
                </div>
                <div className="menu-task-element">
                    <Button onClick={props.toggleMenu} icon='menu'/>
                </div>
            </div>
        </div>
    );
}
